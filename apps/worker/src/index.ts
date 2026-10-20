import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { isValidRecord } from '@sori/core';
import { allowAttempt, issueToken, passphraseMatches, verifyToken } from './auth';
import { authorize } from './consent';
import { handleMcp } from './mcp';
import { coachEnabled, handleCoach } from './coach';
import { changesSince, putRecords, type WireRecord } from './store';

const app = new Hono<{ Bindings: Env }>();

// The app authenticates with a bearer token (no cookies), so any origin may call the API:
// the web preview, the Android app (https://localhost) and local development.
app.use('/api/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'OPTIONS'], maxAge: 86400 }));

app.get('/api/health', async (c) => {
  const db = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
  return c.json({ ok: db?.ok === 1, service: 'sori-bloom-api', configured: Boolean(c.env.SORI_PASSPHRASE), aiAvailable: coachEnabled(c.env) });
});

app.post('/api/auth', async (c) => {
  if (!c.env.SORI_PASSPHRASE) return c.json({ error: 'not_configured' }, 503);
  if (!(await allowAttempt(c.env, c.req.header('CF-Connecting-IP') ?? 'unknown'))) return c.json({ error: 'too_many_attempts' }, 429);
  const body = await c.req.json<{ passphrase?: string }>().catch(() => ({}) as { passphrase?: string });
  if (!(await passphraseMatches(c.env, body.passphrase ?? ''))) return c.json({ error: 'wrong_passphrase' }, 401);
  return c.json({ token: await issueToken(c.env) });
});

const wire = z.object({
  kind: z.enum(['settings', 'account', 'category', 'txn', 'repeat', 'budget', 'goal', 'debt', 'wait', 'win']),
  id: z.string().min(1).max(100),
  data: z.record(z.string(), z.unknown()),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
  source: z.enum(['app', 'claude']),
});
const syncBody = z.object({ cursor: z.number().int().nonnegative(), changes: z.array(wire).max(500) });

app.post('/api/sync', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!(await verifyToken(c.env, token))) return c.json({ error: 'unauthorized' }, 401);
  const parsed = syncBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues.slice(0, 5) }, 400);
  // One person's records are small; refuse anything absurd rather than storing it.
  if (parsed.data.changes.some((r) => JSON.stringify(r.data).length > 64_000)) return c.json({ error: 'record_too_large' }, 413);
  // putRecords re-stamps id/updatedAt/deletedAt/source inside `data` from the validated envelope.
  const changes: WireRecord[] = parsed.data.changes.map((r) => ({ ...r, data: r.data as unknown as WireRecord['data'] }));
  if (changes.some((r) => !isValidRecord(r.kind, { ...r.data, id: r.id, updatedAt: r.updatedAt, deletedAt: r.deletedAt, source: r.source }))) return c.json({ error: 'invalid_record' }, 400);
  await putRecords(c.env.DB, changes);
  return c.json(await changesSince(c.env.DB, parsed.data.cursor));
});

app.post('/api/coach', (c) => handleCoach(c.req.raw, c.env));

app.all('/authorize', (c) => authorize(c.req.raw, c.env));

app.get('/', (c) => c.text('Sori server is running. Open the Sori app to use it.'));
app.notFound((c) => c.json({ error: 'not_found' }, 404));

const providers = new Map<string, OAuthProvider<Env>>();

/** One OAuth provider per origin (the resource URL must name this Worker's own address). */
function provider(origin: string): OAuthProvider<Env> {
  let p = providers.get(origin);
  if (!p) {
    p = new OAuthProvider<Env>({
      apiRoute: '/mcp',
      apiHandler: { fetch: (request, env) => handleMcp(request, env) },
      defaultHandler: { fetch: (request, env, ctx) => app.fetch(request, env, ctx) },
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/oauth/token',
      clientRegistrationEndpoint: '/oauth/register',
      clientIdMetadataDocumentEnabled: true,
      scopesSupported: ['sori'],
      requiredScopes: ['sori'],
      resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin], resource_name: 'Sori' },
    });
    providers.set(origin, p);
  }
  return p;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return provider(new URL(request.url).origin).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
