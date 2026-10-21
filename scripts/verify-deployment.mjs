/** Read-only checks of the deployed app, authentication and database sync. */
export async function verifyDeployment({ apiUrl, webUrl, passphrase, request = fetch }) {
  const check = async (url, options) => {
    const response = await request(url, { ...options, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Deployment check failed (${response.status}) at ${new URL(url).pathname}.`);
    return response;
  };
  const health = await (await check(`${apiUrl}/api/health`)).json();
  if (health.ok !== true || health.configured !== true) throw new Error('The sync server or its sign-in passphrase is not ready.');
  const auth = await (await check(`${apiUrl}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passphrase }),
  })).json();
  if (typeof auth.token !== 'string' || !auth.token) throw new Error('The deployed server did not issue a device token.');
  const sync = await (await check(`${apiUrl}/api/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ cursor: 0, changes: [] }),
  })).json();
  if (!Array.isArray(sync.changes) || !Number.isSafeInteger(sync.cursor)) throw new Error('The deployed sync response is invalid.');
  const html = await (await check(webUrl)).text();
  if (!/<title>[^<]*Sori Bloom/i.test(html)) throw new Error('The public page is not the Sori Bloom app.');
  const script = /<script\b[^>]*\bsrc="([^"]+)"/i.exec(html)?.[1];
  if (!script) throw new Error('The public app has no JavaScript bundle.');
  const asset = new URL(script, webUrl);
  if (asset.origin !== new URL(webUrl).origin) throw new Error('The public app bundle has an unexpected origin.');
  const bundle = await (await check(asset.href)).text();
  if (!bundle.includes(apiUrl)) throw new Error('The public app is not configured to use this sync server.');
  // The temporary device token, passphrase and any pulled private records remain in memory only.
  return { webUrl, apiUrl };
}
