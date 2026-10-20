import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { allowAttempt } from '../src/auth';
import { changesSince } from '../src/store';
import { call, deviceToken, PASS } from './helpers';

const json = (body: unknown, headers: Record<string, string> = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('passphrase sign-in', () => {
  it('rejects a wrong passphrase and accepts the right one', async () => {
    expect((await call('/api/auth', json({ passphrase: 'nope' }, { 'CF-Connecting-IP': '1.1.1.1' }))).status).toBe(401);
    const ok = await call('/api/auth', json({ passphrase: PASS }, { 'CF-Connecting-IP': '1.1.1.1' }));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { token: string }).token).toMatch(/^v1\./);
  });

  it('slows down guessing after 10 attempts', async () => {
    for (let i = 0; i < 10; i++) await call('/api/auth', json({ passphrase: 'guess' }, { 'CF-Connecting-IP': '2.2.2.2' }));
    expect((await call('/api/auth', json({ passphrase: PASS }, { 'CF-Connecting-IP': '2.2.2.2' }))).status).toBe(429);
  });

  it('enforces the guessing limit across simultaneous attempts', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => allowAttempt(env as unknown as Env, 'concurrency-test-address')));
    expect(results.filter(Boolean)).toHaveLength(10);
    const stored = await env.DB.prepare('SELECT subject FROM auth_attempts').all<{ subject: string }>();
    expect(stored.results.every((row) => row.subject !== 'concurrency-test-address')).toBe(true);
  });

  it('allows the web app and Android app to call the API (CORS)', async () => {
    const res = await call('/api/sync', { method: 'OPTIONS', headers: { Origin: 'https://localhost', 'Access-Control-Request-Method': 'POST' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('sync', () => {
  const record = (id: string, updatedAt: number, name: string, deletedAt: number | null = null) => ({
    kind: 'goal',
    id,
    data: { id, name, updatedAt, source: 'app', emoji: '🌱', tone: 'mint', kind: 'goal', target: 10_000, saved: 0, monthly: 1_000 },
    updatedAt,
    deletedAt,
    source: 'app',
  });

  it('needs a device token', async () => {
    expect((await call('/api/sync', json({ cursor: 0, changes: [] }))).status).toBe(401);
    expect((await call('/api/sync', json({ cursor: 0, changes: [] }, { Authorization: 'Bearer v1.fake.1.sig' }))).status).toBe(401);
  });

  it('pushes, pulls and keeps the newest edit', async () => {
    const auth = { Authorization: `Bearer ${await deviceToken()}` };
    let res = await call('/api/sync', json({ cursor: 0, changes: [record('g1', 100, 'Trip')] }, auth));
    let body = (await res.json()) as { changes: { id: string; data: { name: string } }[]; cursor: number };
    expect(body.changes.map((c) => c.data.name)).toEqual(['Trip']);

    // An older edit from another device loses; a newer one wins.
    await call('/api/sync', json({ cursor: body.cursor, changes: [record('g1', 50, 'Stale')] }, auth));
    res = await call('/api/sync', json({ cursor: 0, changes: [record('g1', 200, 'Portugal trip')] }, auth));
    body = (await res.json()) as typeof body;
    expect(body.changes.find((c) => c.id === 'g1')?.data.name).toBe('Portugal trip');
  });

  it('syncs deletions as tombstones', async () => {
    const auth = { Authorization: `Bearer ${await deviceToken()}` };
    await call('/api/sync', json({ cursor: 0, changes: [record('g2', 100, 'Old')] }, auth));
    const res = await call('/api/sync', json({ cursor: 0, changes: [record('g2', 300, 'Old', 300)] }, auth));
    const body = (await res.json()) as { changes: { id: string; deletedAt: number | null }[] };
    expect(body.changes.find((c) => c.id === 'g2')?.deletedAt).toBe(300);
  });

  it('refuses oversized records', async () => {
    const auth = { Authorization: `Bearer ${await deviceToken()}` };
    const huge = { ...record('g9', 1, 'x'), data: { id: 'g9', updatedAt: 1, source: 'app', note: 'x'.repeat(70_000) } };
    expect((await call('/api/sync', json({ cursor: 0, changes: [huge] }, auth))).status).toBe(413);
  });

  it('rejects malformed changes', async () => {
    const auth = { Authorization: `Bearer ${await deviceToken()}` };
    expect((await call('/api/sync', json({ cursor: 0, changes: [{ kind: 'nope', id: 'x' }] }, auth))).status).toBe(400);
  });

  it('rejects invalid financial records without partially saving the batch', async () => {
    const auth = { Authorization: `Bearer ${await deviceToken()}` };
    const valid = record('valid-batch-goal', 10, 'Keep it consistent');
    const invalid = { ...record('bad-batch-goal', 10, 'Broken'), data: { ...record('bad-batch-goal', 10, 'Broken').data, target: 0.5 } };
    const res = await call('/api/sync', json({ cursor: 0, changes: [valid, invalid] }, auth));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_record' });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE id IN ('valid-batch-goal', 'bad-batch-goal')").first('n')).toBe(0);
  });

  it('pages through large change sets', async () => {
    const auth = { Authorization: `Bearer ${await deviceToken()}` };
    await call('/api/sync', json({ cursor: 0, changes: [1, 2, 3].map((i) => record(`p${i}`, 10, `P${i}`)) }, auth));
    const first = await changesSince(env.DB, 0, 2);
    expect(first.more).toBe(true);
    const second = await changesSince(env.DB, first.cursor, 2);
    expect(second.changes.length).toBeGreaterThan(0);
  });
});
