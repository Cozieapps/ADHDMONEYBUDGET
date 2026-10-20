import { isValidRecord, RECORD_KINDS, type RecordKind, type RecordMeta } from '@sori/core';
import { useSyncExternalStore } from 'react';
import { db, type StoredRecord } from '../data/db';
import { applyRemote, markClean, pendingChanges } from '../data/repo';
import { apiUrl } from './config';

// Wire format shared with the Worker (apps/worker/src/sync.ts).
export interface WireRecord {
  kind: RecordKind;
  id: string;
  data: RecordMeta;
  updatedAt: number;
  deletedAt: number | null;
  source: 'app' | 'claude';
}

export interface SyncResponse {
  changes: WireRecord[];
  cursor: number;
  more: boolean;
}

export type SyncState =
  | { status: 'off' }
  | { status: 'idle'; lastSync?: number }
  | { status: 'syncing'; lastSync?: number }
  | { status: 'offline'; lastSync?: number }
  | { status: 'error'; message: string; lastSync?: number };

const TOKEN_KEY = 'sori.bloom.token';
const CURSOR_KEY = 'sori.bloom.sync.cursor';
const LAST_KEY = 'sori.bloom.sync.last';

let state: SyncState = { status: token() ? 'idle' : 'off' };
const listeners = new Set<() => void>();
let sessionGeneration = 0;

function set(next: SyncState) {
  state = next;
  for (const l of listeners) l();
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

function previewData(): boolean {
  return db.name === 'sori-bloom-preview';
}

function token(): string | null {
  if (previewData()) return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function isConnected(): boolean {
  return Boolean(token() && apiUrl());
}

/** Exchanges the owner's passphrase for a device token. */
export async function connect(passphrase: string): Promise<void> {
  if (previewData()) throw new Error('Sample previews stay separate. Open your personal budget to connect sync.');
  const attemptGeneration = ++sessionGeneration;
  const base = apiUrl();
  if (!base) throw new Error('Add the address of your Sori server first.');
  const res = await fetch(`${base}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase, device: navigator.userAgent.slice(0, 80) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) throw new Error('Too many tries. Wait 15 minutes and try again.');
  if (!res.ok) throw new Error(res.status === 401 ? 'That passphrase didn’t match.' : `The server said ${res.status}.`);
  const body: unknown = await res.json();
  if (!body || typeof body !== 'object' || !('token' in body) || typeof body.token !== 'string' || !body.token || body.token.length > 1_024) throw new Error('The server returned an invalid sign-in response.');
  if (attemptGeneration !== sessionGeneration) throw new Error('This connection was cancelled.');
  localStorage.setItem(TOKEN_KEY, body.token);
  // A new connection starts from the beginning so this device gets everything.
  await db.meta.put({ key: CURSOR_KEY, value: 0 });
  set({ status: 'idle' });
  await syncNow();
}

export async function disconnect(): Promise<void> {
  if (previewData()) { set({ status: 'off' }); return; }
  sessionGeneration += 1;
  running = null;
  localStorage.removeItem(TOKEN_KEY);
  await db.meta.delete(CURSOR_KEY);
  set({ status: 'off' });
}

let running: Promise<void> | null = null;

/** Pushes local changes and pulls anything newer from the server. Safe to call often. */
export function syncNow(): Promise<void> {
  if (!running) {
    const attempt = run().finally(() => { if (running === attempt) running = null; });
    running = attempt;
  }
  return running;
}

async function run(): Promise<void> {
  const generation = sessionGeneration;
  const base = apiUrl();
  const auth = token();
  if (!base || !auth) {
    set({ status: 'off' });
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    set({ status: 'offline', ...lastSync() });
    return;
  }
  set({ status: 'syncing', ...lastSync() });
  try {
    let cursor = Number((await db.meta.get(CURSOR_KEY))?.value ?? 0);
    for (let page = 0; page < 50; page++) {
      const pending: StoredRecord[] = (await pendingChanges()).slice(0, 500);
      const res = await fetch(`${base}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({
          cursor,
          changes: pending.map((r) => ({ kind: r.kind, id: r.id, data: r.data, updatedAt: r.updatedAt, deletedAt: r.deletedAt, source: r.source })),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (generation !== sessionGeneration) return;
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        set({ status: 'error', message: 'Signed out — reconnect with your passphrase.' });
        return;
      }
      if (!res.ok) throw new Error(`Sync failed (${res.status})`);
      const body = validateSyncResponse(await res.json(), cursor);
      if (generation !== sessionGeneration) return;
      await applyRemote(body.changes.map((c) => ({ kind: c.kind, data: c.data })));
      await markClean(pending.map((r) => ({ key: r.key, updatedAt: r.updatedAt })));
      cursor = body.cursor;
      await db.meta.put({ key: CURSOR_KEY, value: cursor });
      if (!body.more && pending.length < 500) break;
    }
    if (generation !== sessionGeneration) return;
    const now = Date.now();
    await db.meta.put({ key: LAST_KEY, value: now });
    lastSyncAt = now;
    set({ status: 'idle', lastSync: now });
  } catch (error) {
    if (generation !== sessionGeneration) return;
    const offline = error instanceof TypeError;
    set(offline ? { status: 'offline', ...lastSync() } : { status: 'error', message: (error as Error).message, ...lastSync() });
  }
}

let lastSyncAt: number | undefined;
function lastSync(): { lastSync?: number } {
  return lastSyncAt ? { lastSync: lastSyncAt } : {};
}

/** Keeps this device in sync: on open, on resume, after edits, and every minute while visible. */
export function startAutoSync(): () => void {
  if (previewData()) return () => {};
  void db.meta.get(LAST_KEY).then((m) => {
    if (typeof m?.value === 'number') lastSyncAt = m.value;
  });
  void syncNow();
  const onVisible = () => document.visibilityState === 'visible' && void syncNow();
  const onOnline = () => void syncNow();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  const timer = window.setInterval(() => document.visibilityState === 'visible' && void syncNow(), 60_000);
  let debounce: number | undefined;
  const schedule = () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void syncNow(), 2_000);
  };
  // Only local edits (dirty records) trigger a sync — not records just pulled from the server.
  const onCreate = (_key: unknown, obj: StoredRecord) => {
    if (obj.dirty === 1) schedule();
  };
  const onUpdate = (mods: Partial<StoredRecord>, _key: unknown, obj: StoredRecord) => {
    if ((mods.dirty ?? obj.dirty) === 1) schedule();
  };
  db.records.hook('creating', onCreate);
  db.records.hook('updating', onUpdate);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    window.clearInterval(timer);
    window.clearTimeout(debounce);
    db.records.hook('creating').unsubscribe(onCreate);
    db.records.hook('updating').unsubscribe(onUpdate);
  };
}

/** Keeps the stored credential private; only the explicit chat route is permitted. */
export async function authenticatedCoachRequest(body: unknown): Promise<Response> {
  if (previewData()) throw new Error('Sample previews cannot use your cloud connection. Open your personal budget first.');
  const base = apiUrl();
  const auth = token();
  if (!base || !auth) throw new Error('Connect your Sori server in Settings before using cloud AI.');
  return fetch(`${base}/api/coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

/** Validate the entire response before clearing any pending edits or touching local data. */
export function validateSyncResponse(value: unknown, previousCursor: number): SyncResponse {
  const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
  const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  const fail = () => { throw new Error('The server returned invalid budget data. Your local changes are still saved.'); };
  if (!object(value) || !integer(value.cursor) || value.cursor < previousCursor || typeof value.more !== 'boolean' || !Array.isArray(value.changes) || value.changes.length > 500 || (value.more && value.cursor <= previousCursor)) return fail();
  for (const row of value.changes) {
    if (!object(row) || !RECORD_KINDS.includes(row.kind as RecordKind) || typeof row.id !== 'string' || !integer(row.updatedAt) || !(row.deletedAt === null || integer(row.deletedAt)) || !['app', 'claude'].includes(row.source as string)) return fail();
    if (!isValidRecord(row.kind as RecordKind, row.data) || row.data.id !== row.id || row.data.updatedAt !== row.updatedAt || row.data.source !== row.source || (row.data.deletedAt ?? null) !== row.deletedAt) return fail();
  }
  return value as unknown as SyncResponse;
}
