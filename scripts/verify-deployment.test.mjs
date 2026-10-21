import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyDeployment } from './verify-deployment.mjs';
const apiUrl = 'https://sori-bloom-api.example.workers.dev';
const webUrl = 'https://sori-bloom.pages.dev';
const passphrase = 'development-only-test-passphrase';
function fixture(change = {}) {
  const calls = [];
  const replies = {
    [`${apiUrl}/api/health`]: { ok: true, configured: true },
    [`${apiUrl}/api/auth`]: { token: 'temporary-test-device-token' },
    [`${apiUrl}/api/sync`]: { cursor: 0, changes: [] },
    [webUrl]: '<title>Sori Bloom</title><script type="module" src="/assets/main.js"></script>',
    [`${webUrl}/assets/main.js`]: `const api=${JSON.stringify(apiUrl)};`,
    ...change,
  };
  return { calls, request: async (url, options) => {
    calls.push({ url, options });
    if (!(url in replies)) throw new Error('Unexpected request');
    const value = replies[url];
    return value instanceof Response ? value : new Response(typeof value === 'string' ? value : JSON.stringify(value));
  } };
}
test('checks real sign-in, read-only sync and the public bundle server address', async () => {
  const f = fixture();
  assert.deepEqual(await verifyDeployment({ apiUrl, webUrl, passphrase, request: f.request }), { apiUrl, webUrl });
  const sync = f.calls.find(c => c.url.endsWith('/api/sync'));
  assert.deepEqual(JSON.parse(sync.options.body), { cursor: 0, changes: [] });
  assert.equal(f.calls.filter(c => c.options.body?.includes(passphrase)).map(c => c.url).join(), `${apiUrl}/api/auth`);
});
test('refuses an unhealthy database before attempting sign-in', async () => {
  const f = fixture({ [`${apiUrl}/api/health`]: { ok: false, configured: true } });
  await assert.rejects(verifyDeployment({ apiUrl, webUrl, passphrase, request: f.request }), /not ready/);
  assert.equal(f.calls.length, 1);
});
test('refuses sign-in rejection without exposing request or response secrets', async () => {
  const f = fixture({ [`${apiUrl}/api/auth`]: new Response('secret-bearing-server-response', { status: 401 }) });
  await assert.rejects(verifyDeployment({ apiUrl, webUrl, passphrase, request: f.request }), e => {
    assert.equal(e.message.includes(passphrase), false); assert.equal(e.message.includes('secret-bearing'), false);
    return /401/.test(e.message);
  });
});
test('rejects a malformed sync response', async () => {
  const f = fixture({ [`${apiUrl}/api/sync`]: { cursor: 'bad', changes: [] } });
  await assert.rejects(verifyDeployment({ apiUrl, webUrl, passphrase, request: f.request }), /sync response/);
});
test('rejects a different app at the configured public URL', async () => {
  const f = fixture({ [webUrl]: '<title>Different application</title>' });
  await assert.rejects(verifyDeployment({ apiUrl, webUrl, passphrase, request: f.request }), /not the Sori/);
});
test('does not fetch an unexpected script origin', async () => {
  const f = fixture({ [webUrl]: '<title>Sori Bloom</title><script src="https://unexpected.example/app.js"></script>' });
  await assert.rejects(verifyDeployment({ apiUrl, webUrl, passphrase, request: f.request }), /unexpected origin/);
  assert.equal(f.calls.some(c => c.url.includes('unexpected.example')), false);
});
test('rejects a bundle pointed at another server', async () => {
  const f = fixture({ [`${webUrl}/assets/main.js`]: 'const api="https://other.example";' });
  await assert.rejects(verifyDeployment({ apiUrl, webUrl, passphrase, request: f.request }), /not configured/);
});
