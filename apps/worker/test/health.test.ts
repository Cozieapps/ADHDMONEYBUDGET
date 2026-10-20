import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('GET /api/health', () => {
  it('reports the service and database as healthy', async () => {
    const res = await exports.default.fetch('https://sori.test/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'sori-bloom-api', configured: true, aiAvailable: false });
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await exports.default.fetch('https://sori.test/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});

describe('records table', () => {
  it('rejects an unknown source', async () => {
    const { env } = await import('cloudflare:workers');
    const insert = env.DB.prepare(
      "INSERT INTO records (kind, id, data, updated_at, source, server_seq) VALUES ('t', '1', '{}', 1, 'robot', 1)",
    );
    await expect(insert.run()).rejects.toThrow(/CHECK constraint/);
  });
});
