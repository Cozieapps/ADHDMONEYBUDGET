import { describe, expect, it } from 'vitest';
import { call, MCP_HEADERS, PASS, rpc } from './helpers';

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

describe('connecting Claude (OAuth)', () => {
  it('asks unauthenticated MCP clients to sign in', async () => {
    const res = await call('/mcp', { method: 'POST', headers: MCP_HEADERS, body: rpc(1, 'tools/list') });
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('resource_metadata');
    const meta = await call('/.well-known/oauth-protected-resource/mcp');
    expect(meta.status).toBe(200);
  });

  it('completes the full connector flow with the passphrase', async () => {
    // 1. Claude registers itself.
    const reg = await call('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
    });
    expect(reg.status).toBe(201);
    const { client_id } = (await reg.json()) as { client_id: string };

    // 2. The owner sees Sori's consent page.
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const params = new URLSearchParams({ response_type: 'code', client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'sori', resource: 'https://sori.test/mcp' });
    const page = await call(`/authorize?${params}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Let Claude use Sori?');
    const handle = /name="handle" value="([^"]+)"/.exec(html)![1]!;
    const cookie = cookiesFrom(page);

    // A wrong passphrase is refused.
    const wrong = await call(`/authorize?${params}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '9.9.9.9' }, body: new URLSearchParams({ handle, passphrase: 'nope', decision: 'approve' }) });
    expect(wrong.status).toBe(401);

    // 3. Approving with the passphrase redirects back to Claude with a code.
    const approve = await call(`/authorize?${params}`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '9.9.9.9' },
      body: new URLSearchParams({ handle, passphrase: PASS, decision: 'approve' }),
      redirect: 'manual',
    });
    expect(approve.status).toBe(302);
    const location = new URL(approve.headers.get('Location')!);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get('state')).toBe('xyz');

    // 4. Claude swaps the code for a token.
    const tokenRes = await call('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: location.searchParams.get('code')!, redirect_uri: REDIRECT, client_id, code_verifier: verifier, resource: 'https://sori.test/mcp' }),
    });
    expect(tokenRes.status).toBe(200);
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    // 5. …and can use Sori's tools.
    const tools = await call('/mcp', { method: 'POST', headers: { ...MCP_HEADERS, Authorization: `Bearer ${access_token}` }, body: rpc(1, 'tools/list') });
    expect(tools.status).toBe(200);
    const body = (await tools.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.map((t) => t.name)).toContain('get_overview');
  });
});
