import { buildDemo, today, defaultCategories, RECORD_KINDS, type RecordKind, type RecordMeta, type RecordOf, type Snapshot, snapshotFromRecords } from '@sori/core';
import { db, type StoredRecord } from './db';

export type AnyRecord = RecordMeta & Record<string, unknown>;
export type Put = { [K in RecordKind]: { kind: K; record: RecordOf<K> } }[RecordKind];

function toStored(kind: RecordKind, record: RecordMeta, dirty: 0 | 1): StoredRecord {
  return {
    key: `${kind}:${record.id}`,
    kind,
    id: record.id,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt ?? null,
    source: record.source,
    data: record,
    dirty,
  };
}

/** Saves records locally (marking them for sync), stamping updatedAt so the newest edit wins. */
export async function save(...puts: Put[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.records, async () => {
    const existing = await db.records.bulkGet(puts.map(({ kind, record }) => `${kind}:${record.id}`));
    await db.records.bulkPut(
      puts.map(({ kind, record }, i) => {
        // Always move forward, even for two edits in the same millisecond.
        const floor = Math.max(record.updatedAt, existing[i]?.updatedAt ?? 0) + 1;
        return toStored(kind, { ...record, updatedAt: Math.max(now, floor) }, 1);
      }),
    );
  });
}

export async function remove(kind: RecordKind, record: RecordMeta): Promise<void> {
  const now = Date.now();
  await save({ kind, record: { ...record, deletedAt: now, updatedAt: now } } as Put);
}

export async function restore(kind: RecordKind, record: RecordMeta): Promise<void> {
  await save({ kind, record: { ...record, deletedAt: null } } as Put);
}

/** Applies records from the sync server: the newer edit wins, and pending local edits are kept. */
export async function applyRemote(records: { kind: RecordKind; data: RecordMeta }[]): Promise<number> {
  let applied = 0;
  await db.transaction('rw', db.records, async () => {
    for (const { kind, data } of records) {
      if (!RECORD_KINDS.includes(kind)) continue;
      const key = `${kind}:${data.id}`;
      const local = await db.records.get(key);
      if (local && local.updatedAt >= data.updatedAt) continue;
      await db.records.put(toStored(kind, data, 0));
      applied += 1;
    }
  });
  return applied;
}

export async function pendingChanges(): Promise<StoredRecord[]> {
  return db.records.where('dirty').equals(1).toArray();
}

export async function markClean(keys: { key: string; updatedAt: number }[]): Promise<void> {
  await db.transaction('rw', db.records, async () => {
    for (const { key, updatedAt } of keys) {
      const current = await db.records.get(key);
      // Only clear if nothing changed since this version was pushed.
      if (current && current.updatedAt === updatedAt) await db.records.update(key, { dirty: 0 });
    }
  });
}

/** Replaces every record (example data, import). Old records are tombstoned so sync removes them too. */
export async function replaceAll(snapshot: Snapshot): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.records, async () => {
    const existing = await db.records.toArray();
    const tombstones = existing
      .filter((r) => r.deletedAt === null)
      .map((r) => toStored(r.kind, { ...(r.data as RecordMeta), deletedAt: now, updatedAt: now }, 1));
    await db.records.bulkPut(tombstones);
    await db.records.bulkPut(snapshotToPuts(snapshot).map(({ kind, record }) => toStored(kind, { ...record, updatedAt: now + 1 }, 1)));
  });
}

export function snapshotToPuts(s: Snapshot): Put[] {
  return [
    { kind: 'settings', record: s.settings },
    ...s.accounts.map((record) => ({ kind: 'account' as const, record })),
    ...s.categories.map((record) => ({ kind: 'category' as const, record })),
    ...s.txns.map((record) => ({ kind: 'txn' as const, record })),
    ...s.repeats.map((record) => ({ kind: 'repeat' as const, record })),
    ...s.budgets.map((record) => ({ kind: 'budget' as const, record })),
    ...s.goals.map((record) => ({ kind: 'goal' as const, record })),
    ...s.debts.map((record) => ({ kind: 'debt' as const, record })),
    ...s.waits.map((record) => ({ kind: 'wait' as const, record })),
    ...s.wins.map((record) => ({ kind: 'win' as const, record })),
  ];
}

/** Builds the in-memory snapshot the screens and the engine work from. */
export function buildSnapshot(records: readonly StoredRecord[]): Snapshot {
  return snapshotFromRecords(records.map((r) => ({ kind: r.kind, data: r.data })));
}

/** Wipes everything on this device. */
export async function wipeLocal(): Promise<void> {
  await db.transaction('rw', db.records, db.meta, async () => {
    await db.records.clear();
    await db.meta.clear();
  });
}

/** First run: store the default categories so edits to them sync like everything else. */
export async function ensureSeeded(): Promise<void> {
  if (new URLSearchParams(location.search).get('preview') === '1' && !(await db.records.get('settings:settings'))) {
    await replaceAll(buildDemo(today()));
    return;
  }
  const count = await db.records.where('kind').equals('category').count();
  if (count === 0) await save(...defaultCategories().map((record) => ({ kind: 'category' as const, record })));
}
