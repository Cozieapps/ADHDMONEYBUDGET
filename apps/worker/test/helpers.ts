import { exports } from 'cloudflare:workers';

export const PASS = 'correct horse battery staple';
export const ORIGIN = 'https://sori.test';

export function call(path: string, init: RequestInit = {}): Promise<Response> {
  return exports.default.fetch(new Request(`${ORIGIN}${path}`, init));
}

export async function deviceToken(ip = '10.0.0.1'): Promise<string> {
  const res = await call('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify({ passphrase: PASS }) });
  return ((await res.json()) as { token: string }).token;
}

export const rpc = (id: number, method: string, params: unknown = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params });

export const MCP_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' };
