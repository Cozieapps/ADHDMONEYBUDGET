import {
  addToGoal,
  isValidRecord,
  autopayDue,
  buildDemo,
  type Account,
  type Cents,
  createTxn,
  type Debt,
  defaultCategories,
  defaultSettings,
  type Goal,
  type ISODate,
  markRepeatPaid,
  meta,
  type NewTxn,
  payDebt,
  type RecordKind,
  type RecordMeta,
  type Repeat,
  SETTINGS_ID,
  type Settings,
  type Snapshot,
  takeFromGoal,
  type Txn,
  unmarkRepeatPaid,
  type WaitItem,
  type WinDay,
} from '@sori/core';
import { type Put, remove, replaceAll, restore, save, snapshotToPuts, wipeLocal } from './repo';

// App-level operations. Each returns an `undo` where an undo makes sense.

export type Undo = () => Promise<void>;

export async function logTxn(input: NewTxn): Promise<{ txn: Txn; undo: Undo }> {
  const txn = createTxn(input);
  await save({ kind: 'txn', record: txn });
  return { txn, undo: () => remove('txn', txn) };
}

export async function updateTxn(txn: Txn): Promise<void> {
  await save({ kind: 'txn', record: txn });
}

export async function deleteRecord(kind: RecordKind, record: RecordMeta): Promise<Undo> {
  await remove(kind, record);
  return () => restore(kind, record);
}

export async function saveRecord(put: Put): Promise<void> {
  await save(put);
}

export async function updateSettings(current: Settings, patch: Partial<Settings>): Promise<void> {
  await save({ kind: 'settings', record: { ...current, ...patch, id: SETTINGS_ID } });
}

export async function setPaid(snapshot: Snapshot, repeat: Repeat, date: ISODate, paid: boolean): Promise<void> {
  if (paid) {
    const { repeat: updated, txn } = markRepeatPaid(repeat, date);
    await save({ kind: 'repeat', record: updated }, { kind: 'txn', record: txn });
  } else {
    const { repeat: updated, txns } = unmarkRepeatPaid(snapshot, repeat, date);
    await save({ kind: 'repeat', record: updated }, ...txns.map((record) => ({ kind: 'txn' as const, record })));
  }
}

/** Logs autopay bills that have come due. Safe to call repeatedly. */
export async function runAutopay(snapshot: Snapshot, today: ISODate): Promise<number> {
  const due = autopayDue(snapshot, today);
  if (!due.length || !snapshot.settings.setupDone) return 0;
  const byRepeat = new Map<string, Repeat>();
  const puts: Put[] = [];
  for (const { repeat, date } of due) {
    const current = byRepeat.get(repeat.id) ?? repeat;
    const { repeat: updated, txn } = markRepeatPaid(current, date);
    byRepeat.set(repeat.id, updated);
    puts.push({ kind: 'txn', record: txn });
  }
  for (const record of byRepeat.values()) puts.push({ kind: 'repeat', record });
  await save(...puts);
  return due.length;
}

export async function checkBalances(accounts: { account: Account; balance: Cents }[], today: ISODate, snapshot: Snapshot): Promise<void> {
  const now = Date.now();
  await save(
    ...accounts.map(({ account, balance }) => ({ kind: 'account' as const, record: { ...account, balance, checkedAt: now, checkedOn: today } })),
    { kind: 'win', record: winRecord(snapshot, today, { checkedBalance: true }) },
  );
}

export function winRecord(snapshot: Snapshot, date: ISODate, patch: Partial<WinDay>): WinDay {
  const existing = snapshot.wins.find((w) => w.date === date);
  return { ...(existing ?? { id: date, updatedAt: 0, source: 'app', date }), ...patch };
}

export async function setWin(snapshot: Snapshot, date: ISODate, patch: Partial<WinDay>): Promise<void> {
  await save({ kind: 'win', record: winRecord(snapshot, date, patch) });
}

export async function moveGoalMoney(goal: Goal, amount: Cents, today: ISODate, direction: 'add' | 'take'): Promise<Undo> {
  const { goal: updated, txn } = direction === 'add' ? addToGoal(goal, amount, today) : takeFromGoal(goal, amount, today);
  await save({ kind: 'goal', record: updated }, { kind: 'txn', record: txn });
  return async () => {
    await save({ kind: 'goal', record: goal });
    await remove('txn', txn);
  };
}

export async function recordDebtPayment(debt: Debt, amount: Cents, today: ISODate): Promise<Undo> {
  const { debt: updated, txn } = payDebt(debt, amount, today);
  await save({ kind: 'debt', record: updated }, { kind: 'txn', record: txn });
  return async () => {
    await save({ kind: 'debt', record: debt });
    await remove('txn', txn);
  };
}

export async function decideWait(item: WaitItem, status: 'bought' | 'skipped', today: ISODate): Promise<void> {
  const decided: WaitItem = { ...item, status, decidedAt: Date.now() };
  if (status === 'bought') {
    const txn = createTxn({ date: today, amount: item.amount, type: 'spend', note: item.name, categoryId: 'cat-spend-shopping' });
    await save({ kind: 'wait', record: decided }, { kind: 'txn', record: txn });
  } else {
    await save({ kind: 'wait', record: decided });
  }
}

export async function addWait(name: string, amount: Cents, link?: string): Promise<void> {
  const now = Date.now();
  const item: WaitItem = { ...meta('app', now), name, amount, addedAt: now, decideAfter: now + 48 * 3_600_000, status: 'waiting', ...(link ? { link } : {}) };
  await save({ kind: 'wait', record: item });
}

export async function loadExampleData(today: ISODate): Promise<void> {
  await replaceAll(buildDemo(today));
}

/** Clears everything (including example data) and starts fresh. Synced devices are cleared too. */
export async function startFresh(): Promise<void> {
  await replaceAll({
    settings: defaultSettings(),
    categories: defaultCategories(),
    accounts: [],
    txns: [],
    repeats: [],
    budgets: [],
    goals: [],
    debts: [],
    waits: [],
    wins: [],
  });
}

export async function eraseThisDevice(): Promise<void> {
  await wipeLocal();
}

export function exportJSON(snapshot: Snapshot): string {
  return JSON.stringify({ app: 'sori-bloom', version: 1, exportedAt: new Date().toISOString(), snapshot }, null, 2);
}

export function exportCSV(snapshot: Snapshot): string {
  const cat = new Map(snapshot.categories.map((c) => [c.id, c.name]));
  const rows = [['date', 'type', 'amount', 'category', 'merchant', 'note', 'tags']];
  for (const t of snapshot.txns) {
    rows.push([t.date, t.type, (t.amount / 100).toFixed(2), cat.get(t.categoryId ?? '') ?? '', t.merchant ?? '', t.note ?? '', t.tags.join(' ')]);
  }
  const cell = (value: string) => {
    // Quoting alone does not stop spreadsheet formula evaluation.
    const safe = /^\s*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\n');
}

export async function importJSON(text: string): Promise<void> {
  if (text.length > 20_000_000) throw new Error('This backup is too large to restore.');
  const parsed: unknown = JSON.parse(text);
  const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
  if (!object(parsed) || !['sori-bloom', 'sori'].includes(parsed.app as string) || parsed.version !== 1 || !object(parsed.snapshot)) throw new Error('This file is not a supported Sori backup.');
  const snapshot = parsed.snapshot;
  if (!isValidRecord('settings', snapshot.settings)) throw new Error('The backup contains invalid settings. Nothing was changed.');
  const lists = { accounts: 'account', categories: 'category', txns: 'txn', repeats: 'repeat', budgets: 'budget', goals: 'goal', debts: 'debt', waits: 'wait', wins: 'win' } as const;
  let count = 0;
  for (const [key, kind] of Object.entries(lists)) {
    const list = snapshot[key];
    if (!Array.isArray(list) || (count += list.length) > 50_000) throw new Error('The backup has missing or oversized record lists. Nothing was changed.');
    const ids = new Set<string>();
    for (const record of list) {
      if (!isValidRecord(kind, record) || ids.has(record.id)) throw new Error('The backup contains invalid or duplicate records. Nothing was changed.');
      ids.add(record.id);
    }
  }
  await replaceAll(snapshot as unknown as Snapshot);
}

export { snapshotToPuts };
