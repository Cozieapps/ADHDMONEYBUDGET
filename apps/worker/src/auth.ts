// Single-owner auth: one passphrase (a Worker secret) signs devices in and approves Claude.

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(`sori-device-token:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function b64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time passphrase check (hashing first makes lengths equal). */
export async function passphraseMatches(env: Env, attempt: string): Promise<boolean> {
  if (!env.SORI_PASSPHRASE || !attempt) return false;
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(attempt)), crypto.subtle.digest('SHA-256', encoder.encode(env.SORI_PASSPHRASE))]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** Device token: `v1.<device>.<issuedAt>.<signature>`. Changing the passphrase signs every device out. */
export async function issueToken(env: Env, now = Date.now()): Promise<string> {
  const payload = `v1.${crypto.randomUUID()}.${now}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.SORI_PASSPHRASE), encoder.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

const MAX_AGE_MS = 400 * 86_400_000;

export async function verifyToken(env: Env, token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token || !env.SORI_PASSPHRASE) return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const issued = Number(parts[2]);
  if (!Number.isFinite(issued) || now - issued > MAX_AGE_MS || issued > now + 60_000) return false;
  const expected = await crypto.subtle.sign('HMAC', await hmacKey(env.SORI_PASSPHRASE), encoder.encode(parts.slice(0, 3).join('.')));
  const given = encoder.encode(parts[3]!);
  const want = encoder.encode(b64url(expected));
  return given.byteLength === want.byteLength && crypto.subtle.timingSafeEqual(given, want);
}

/** At most 10 passphrase attempts per fixed 15-minute window across all isolates. */
export async function allowAttempt(env: Env, ip: string): Promise<boolean> {
  const window = Math.floor(Date.now() / (15 * 60_000));
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(ip));
  const subject = b64url(digest);
  const reservation = await env.DB.prepare(`INSERT INTO auth_attempts (subject, window, attempts) VALUES (?1, ?2, 1)
    ON CONFLICT (subject, window) DO UPDATE SET attempts = auth_attempts.attempts + 1
    WHERE auth_attempts.attempts < 10 RETURNING attempts`).bind(subject, window).first();
  // Keep overlapping windows for requests crossing a boundary, without retaining
  // a long-lived address history. The raw IP address is never stored.
  await env.DB.prepare('DELETE FROM auth_attempts WHERE window < ?1').bind(window - 2).run();
  return reservation !== null;
}
