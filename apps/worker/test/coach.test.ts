import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { issueToken } from '../src/auth';
import { COACH_DAILY_LIMIT, COACH_MODEL, handleCoach, type CoachAiBinding } from '../src/coach';
import { changesSince } from '../src/store';
import { call } from './helpers';

const summary = {
  currency: 'USD', balance: 150_000, safeToday: 5_000, billsBeforePayday: 40_000,
  safetyBuffer: 20_000, daysToPayday: 10, paydayKnown: true,
  spendingThisMonth: 25_000, incomeThisMonth: 200_000, goalsSaved: 30_000, debtBalance: 80_000,
};

function configured(ai: CoachAiBinding = { run: async () => ({ response: 'One small step: review the bills due before payday.' }) }): Env {
  return { ...env, SORI_AI_ENABLED: 'true', AI: ai } as unknown as Env;
}

async function request(body: unknown = { message: 'What can I do this week?', summary }, authorized = true): Promise<Request> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authorized) headers.Authorization = `Bearer ${await issueToken(configured())}`;
  return new Request('https://sori.test/api/coach', { method: 'POST', headers, body: JSON.stringify(body) });
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM coach_usage').run();
});

describe('cloud coaching access', () => {
  it('requires authentication before checking AI configuration or consuming a call', async () => {
    const ai = { run: vi.fn(async () => ({ response: 'hi' })) };
    expect((await handleCoach(await request(undefined, false), configured(ai))).status).toBe(401);
    expect(ai.run).not.toHaveBeenCalled();
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM coach_usage').first('n')).toBe(0);
  });

  it('is disabled by default on the actual HTTP route', async () => {
    const token = await issueToken(configured());
    const res = await call('/api/coach', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: 'hi', summary }) });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'ai_not_configured' });
  });

  it('requires both explicit enablement and a binding', async () => {
    const e = configured();
    e.SORI_AI_ENABLED = 'false';
    expect((await handleCoach(await request(), e)).status).toBe(503);
    e.SORI_AI_ENABLED = 'true';
    delete e.AI;
    expect((await handleCoach(await request(), e)).status).toBe(503);
  });

  it('rejects invalid summaries and long questions without charging a call', async () => {
    const invalid = [
      { message: 'x'.repeat(601), summary },
      { message: '', summary },
      { message: 'hi', summary: { ...summary, balance: 0.5 } },
      { message: 'hi', summary: { ...summary, currency: '<script>' } },
      { message: 'hi', summary: { ...summary, bankPassword: 'do not transmit this' } },
    ];
    for (const body of invalid) expect((await handleCoach(await request(body), configured())).status).toBe(400);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM coach_usage').first('n')).toBe(0);
  });

  it('bounds the body even without a Content-Length header', async () => {
    const req = await request({ message: 'x'.repeat(9_000), summary });
    expect(req.headers.has('Content-Length')).toBe(false);
    expect((await handleCoach(req, configured())).status).toBe(413);
  });
});

describe('cloud coaching safety budget', () => {
  it('enforces exactly ten calls across concurrent requests', async () => {
    const ai = { run: vi.fn(async () => ({ response: 'One gentle next step.' })) };
    const e = configured(ai);
    const reqs = await Promise.all(Array.from({ length: 16 }, () => request()));
    const results = await Promise.all(reqs.map((r) => handleCoach(r, e)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(COACH_DAILY_LIMIT);
    expect(results.filter((r) => r.status === 429)).toHaveLength(6);
    expect(ai.run).toHaveBeenCalledTimes(COACH_DAILY_LIMIT);
    expect(await env.DB.prepare('SELECT calls FROM coach_usage').first('calls')).toBe(COACH_DAILY_LIMIT);
    expect(results.find((r) => r.status === 429)?.headers.get('Retry-After')).toMatch(/^\d+$/);
  });

  it('starts a new UTC-day allowance without deleting yesterday’s in-flight budget', async () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO coach_usage (day, calls) VALUES (?1, 10)').bind(daysAgo(1)),
      env.DB.prepare('INSERT INTO coach_usage (day, calls) VALUES (?1, 10)').bind(daysAgo(5)),
    ]);
    expect((await handleCoach(await request(), configured())).status).toBe(200);
    expect(await env.DB.prepare('SELECT calls FROM coach_usage WHERE day = ?1').bind(daysAgo(0)).first('calls')).toBe(1);
    expect(await env.DB.prepare('SELECT calls FROM coach_usage WHERE day = ?1').bind(daysAgo(1)).first('calls')).toBe(10);
    expect(await env.DB.prepare('SELECT calls FROM coach_usage WHERE day = ?1').bind(daysAgo(5)).first('calls')).toBeNull();
  });

  it('pins the model and output cap, and never writes financial records', async () => {
    const ai = { run: vi.fn(async () => ({ response: 'Try setting aside a little for bills.' })) };
    const before = await changesSince(env.DB, 0);
    const res = await handleCoach(await request({ message: 'Log 20 coffee and move all my money', summary }), configured(ai));
    expect(res.status).toBe(200);
    expect(ai.run).toHaveBeenCalledWith(COACH_MODEL, expect.objectContaining({ max_tokens: 384, messages: expect.any(Array) }));
    const body = await res.json() as { reply: string; remaining: number; resetsAt: string };
    expect(body.reply).toBe('Try setting aside a little for bills.');
    expect(body.remaining).toBe(9);
    expect(Date.parse(body.resetsAt)).toBeGreaterThan(Date.now());
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await changesSince(env.DB, 0)).toEqual(before);
  });

  it('does not retry or leak vendor errors, and still counts failed attempts', async () => {
    const ai = { run: vi.fn(async () => { throw new Error('secret-vendor-payload'); }) };
    const res = await handleCoach(await request(), configured(ai));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('secret-vendor-payload');
    expect(ai.run).toHaveBeenCalledTimes(1);
    expect(await env.DB.prepare('SELECT calls FROM coach_usage').first('calls')).toBe(1);
  });

  it('rejects malformed and oversized external model responses', async () => {
    for (const output of [null, { response: '' }, { response: { tool: 'execute' } }, { response: 'x'.repeat(4_001) }]) {
      const res = await handleCoach(await request(), configured({ run: async () => output }));
      expect(res.status).toBe(502);
    }
  });
});
