import 'fake-indexeddb/auto';
import { buildDemo, defaultSettings } from '@sori/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { applyRemote, buildSnapshot, markClean, pendingChanges, remove, replaceAll, save, wipeLocal } from './repo';

beforeEach(async () => {
  await wipeLocal();
});

describe('local repository', () => {
  it('saves records, marks them for sync and builds a snapshot', async () => {
    await save({ kind: 'settings', record: { ...defaultSettings(1), name: 'Jordan' } });
    const snapshot = buildSnapshot(await db.records.toArray());
    expect(snapshot.settings.name).toBe('Jordan');
    expect(snapshot.categories.length).toBeGreaterThan(5);
    expect(await pendingChanges()).toHaveLength(1);
  });

  it('soft-deletes so the deletion can sync', async () => {
    const settings = defaultSettings(1);
    await save({ kind: 'settings', record: settings });
    await remove('settings', settings);
    const stored = await db.records.get('settings:settings');
    expect(stored?.deletedAt).not.toBeNull();
  });

  it('lets the newer edit win when applying remote changes', async () => {
    const settings = { ...defaultSettings(1), name: 'Local' };
    await save({ kind: 'settings', record: settings });
    const local = await db.records.get('settings:settings');
    const older = { ...settings, name: 'Older', updatedAt: local!.updatedAt - 10 };
    const newer = { ...settings, name: 'Newer', updatedAt: local!.updatedAt + 10 };
    expect(await applyRemote([{ kind: 'settings', data: older }])).toBe(0);
    expect(await applyRemote([{ kind: 'settings', data: newer }])).toBe(1);
    expect(buildSnapshot(await db.records.toArray()).settings.name).toBe('Newer');
    expect(await pendingChanges()).toHaveLength(0);
  });

  it('only clears the sync flag for the version that was pushed', async () => {
    await save({ kind: 'settings', record: defaultSettings(1) });
    const [pushed] = await pendingChanges();
    await save({ kind: 'settings', record: { ...defaultSettings(1), name: 'Edited meanwhile' } });
    await markClean([{ key: pushed!.key, updatedAt: pushed!.updatedAt }]);
    expect(await pendingChanges()).toHaveLength(1);
  });

  it('replaces everything with example data and tombstones the old records', async () => {
    await save({ kind: 'settings', record: { ...defaultSettings(1), name: 'Me' } });
    await replaceAll(buildDemo('2026-10-20', new Date('2026-10-20T14:00:00').getTime()));
    const snapshot = buildSnapshot(await db.records.toArray());
    expect(snapshot.settings.name).toBe('Jordan');
    expect(snapshot.txns.length).toBeGreaterThan(60);
  });
});
