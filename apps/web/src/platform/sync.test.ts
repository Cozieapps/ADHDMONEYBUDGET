import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@sori/core';
import { db } from '../data/db';
import { pendingChanges, save, wipeLocal } from '../data/repo';
import { authenticatedCoachRequest, connect, disconnect, isConnected, startAutoSync, syncNow, validateSyncResponse } from './sync';

vi.mock('./config', () => ({ apiUrl: () => 'https://budget.example.test' }));
const TOKEN_KEY = 'sori.bloom.token';
const personalName = db.name;
const goal = { id: 'remote-goal', updatedAt: 10, source: 'app' as const, name: 'A little space', emoji: '🌱', tone: 'mint', kind: 'goal', target: 10_000, saved: 0, monthly: 1_000 };
const row = { kind: 'goal', id: goal.id, updatedAt: goal.updatedAt, source: 'app', deletedAt: null, data: goal };

beforeEach(async () => {
  Object.defineProperty(db, 'name', { value: personalName, configurable: true });
  await disconnect();
  localStorage.clear();
  await wipeLocal();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ changes: [], cursor: 0, more: false })));
});
afterEach(() => {
  Object.defineProperty(db, 'name', { value: personalName, configurable: true });
  vi.unstubAllGlobals();
});

it('keeps sample data isolated from personal sync tokens and cloud AI', async () => {
  localStorage.setItem(TOKEN_KEY, 'personal-device-token');
  Object.defineProperty(db, 'name', { value: 'sori-bloom-preview', configurable: true });
  expect(isConnected()).toBe(false);
  await expect(connect('not-transmitted')).rejects.toThrow('Sample previews');
  await expect(authenticatedCoachRequest({ message: 'test' })).rejects.toThrow('Sample previews');
  await syncNow();
  const stop = startAutoSync();
  stop();
  await disconnect();
  expect(localStorage.getItem(TOKEN_KEY)).toBe('personal-device-token');
  expect(fetch).not.toHaveBeenCalled();
});

describe('remote sync response validation', () => {
  it('accepts valid stamped records and rejects identities, invalid amounts and stalled cursors', () => {
    expect(validateSyncResponse({ changes: [row], cursor: 1, more: false }, 0).changes).toHaveLength(1);
    for (const value of [
      { changes: [{ ...row, data: { ...goal, target: 0.5 } }], cursor: 1, more: false },
      { changes: [{ ...row, data: { ...goal, id: 'different' } }], cursor: 1, more: false },
      { changes: [], cursor: 0, more: true },
      { changes: [], cursor: -1, more: false },
      { changes: 'not-an-array', cursor: 1, more: false },
    ]) expect(() => validateSyncResponse(value, 0)).toThrow('invalid budget data');
  });

  it('does not clear pending local edits or import corrupt remote data', async () => {
    await save({ kind: 'settings', record: defaultSettings() });
    localStorage.setItem(TOKEN_KEY, 'test-device-token');
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ changes: [{ ...row, data: { ...goal, target: -1 } }], cursor: 1, more: false }));
    await syncNow();
    expect(await pendingChanges()).toHaveLength(1);
    expect(await db.records.get('goal:remote-goal')).toBeUndefined();
  });

  it('discards a response arriving after the user disconnects', async () => {
    await save({ kind: 'settings', record: defaultSettings() });
    localStorage.setItem(TOKEN_KEY, 'test-device-token');
    let respond!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { respond = resolve; }));
    const sync = syncNow();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await disconnect();
    respond(Response.json({ changes: [row], cursor: 1, more: false }));
    await sync;
    expect(await pendingChanges()).toHaveLength(1);
    expect(await db.records.get('goal:remote-goal')).toBeUndefined();
  });
});
