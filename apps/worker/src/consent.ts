import { AuthorizationError, CimdFetchError, type ConsentDescription } from '@cloudflare/workers-oauth-provider';
import { allowAttempt, passphraseMatches } from './auth';

const escape = (value: string) => value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const STYLE = `
:root{--bg:#fff9f7;--card:#fff;--text:#3a2b35;--muted:#6f5f69;--pink:#f6c6d6;--ink:#4a2236;--rose:#a3416a;--border:#f0e2e7;--peach:#ffe4d4;--peach-ink:#8a4b22;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#1c1922;--card:#25212c;--text:#f5eef3;--muted:#bdb1bc;--pink:#f4b8cc;--ink:#3a1a2a;--rose:#f4b8cc;--border:#3b3545;--peach:#3d2a20;--peach-ink:#ffc9a8;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:100%;max-width:440px;background:var(--card);border:1px solid var(--border);border-radius:18px;padding:28px}
h1{font:600 1.6rem/1.2 Georgia,serif;margin:12px 0 8px}p{margin:0 0 12px}.muted{color:var(--muted);font-size:.9rem}
.logo{width:48px;height:48px;border-radius:14px;background:var(--pink);display:grid;place-items:center;font-size:24px}
label{display:block;font-weight:600;margin:16px 0 6px}input[type=password]{width:100%;min-height:48px;padding:0 14px;border:1px solid var(--border);border-radius:12px;background:var(--card);color:var(--text);font:inherit}
.row{display:flex;gap:8px;margin-top:20px}button{flex:1;min-height:48px;border:0;border-radius:999px;font:600 1rem system-ui,sans-serif;cursor:pointer}
.allow{background:var(--pink);color:var(--ink)}.deny{background:transparent;border:1px solid var(--border);color:var(--text)}
.warn{background:var(--peach);color:var(--peach-ink);padding:10px 12px;border-radius:12px;font-size:.9rem}
.error{color:var(--peach-ink);font-weight:600}:focus-visible{outline:3px solid var(--rose);outline-offset:2px}`;

function page(details: ConsentDescription, handle: string, error?: string): string {
  const name = escape(details.clientName || 'An app');
  const origin = details.clientDomain ? `Published by <strong>${escape(details.clientDomain)}</strong>.` : 'This app registered itself, so its name isn’t verified.';
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect ${name} to Sori</title><style>${STYLE}</style>
<main>
  <div class="logo" aria-hidden="true">🌱</div>
  <h1>Let ${name} use Sori?</h1>
  <p>It will be able to see your budget and log spending, bills and goals for you. Everything it adds is marked “Claude added this” and can be undone.</p>
  <p class="muted">${origin} Access goes to <strong>${escape(details.redirectHost)}</strong>.</p>
  ${details.redirectIsLoopback ? '<p class="warn">This sends access to an app on a computer. Continue only if you just started connecting from it.</p>' : ''}
  <form method="post">
    <input type="hidden" name="handle" value="${escape(handle)}">
    <label for="passphrase">Your Sori passphrase</label>
    <input id="passphrase" name="passphrase" type="password" autocomplete="current-password" required autofocus>
    ${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
    <div class="row">
      <button class="deny" name="decision" value="deny">Not now</button>
      <button class="allow" name="decision" value="approve">Allow</button>
    </div>
  </form>
</main></html>`;
}

function html(body: string, headers: Headers, status = 200): Response {
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  return new Response(body, { status, headers });
}

/** /authorize: Sori's own sign-in (the owner passphrase) plus consent, for Claude's connector. */
export async function authorize(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (request.method === 'GET') {
      const authRequest = await oauth.parseAuthRequest(request);
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      return html(page(details, consent.handle), consent.headers);
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const form = await request.formData();
    const handle = String(form.get('handle') ?? '');
    if (form.get('decision') !== 'approve') {
      const denied = await oauth.denyConsent(request, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!(await allowAttempt(env, ip))) return new Response('Too many tries. Wait 15 minutes and try again.', { status: 429 });
    if (!(await passphraseMatches(env, String(form.get('passphrase') ?? '')))) {
      // The consent handle is still unused, so going back to the form works.
      return html(
        `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sori</title><style>${STYLE}</style><main><div class="logo">🌱</div><h1>That passphrase didn’t match</h1><p>Go back and try again — it’s the one you set when you deployed Sori.</p><p class="muted">Use your browser’s back button.</p></main>`,
        new Headers(),
        401,
      );
    }
    const approved = await oauth.approveConsent(request, handle, { scope: ['sori'] });
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      userId: 'owner',
      metadata: { connectedAt: new Date().toISOString() },
      scope: approved.request.scope,
      props: { owner: true },
    });
    approved.headers.set('Location', redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
      const message = error instanceof AuthorizationError ? error.description : 'This app could not be verified.';
      return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    throw error;
  }
}
