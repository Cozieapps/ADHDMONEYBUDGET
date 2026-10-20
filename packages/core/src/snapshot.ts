import { defaultCategories, defaultSettings, SETTINGS_ID } from './factory';
import type { RecordKind, RecordMeta, RecordOf, Snapshot } from './types';

/** Builds the engine's Snapshot from stored records (app: IndexedDB, server: D1). Deleted records are skipped. */
export function snapshotFromRecords(rows: readonly { kind: RecordKind; data: unknown }[]): Snapshot {
  const live = <K extends RecordKind>(kind: K) =>
    rows.filter((r) => r.kind === kind && !(r.data as RecordMeta).deletedAt).map((r) => r.data as RecordOf<K>);
  const settings = live('settings').find((s) => s.id === SETTINGS_ID);
  const categories = live('category');
  return {
    settings: { ...defaultSettings(0), ...(settings ?? {}) },
    accounts: live('account'),
    categories: categories.length ? categories.sort((a, b) => a.order - b.order) : defaultCategories(0),
    txns: live('txn').sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1)),
    repeats: live('repeat'),
    budgets: live('budget'),
    goals: live('goal'),
    debts: live('debt'),
    waits: live('wait'),
    wins: live('win'),
  };
}
