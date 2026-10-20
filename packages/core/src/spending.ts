import { addDays, daysBetween, weekday } from './dates';
import type { Cents } from './money';
import type { ISODate, Snapshot, Txn } from './types';

export function liveTxns(snapshot: Snapshot): Txn[] {
  return snapshot.txns.filter((t) => !t.deletedAt);
}

/** Everyday (non-bill) spending net of refunds. */
export function discretionary(txns: readonly Txn[]): Txn[] {
  return txns.filter((t) => (t.type === 'spend' || t.type === 'refund') && !t.repeatId);
}

export function netSpend(txns: readonly Txn[]): number {
  return txns.reduce((s, t) => s + (t.type === 'spend' ? t.amount : t.type === 'refund' ? -t.amount : 0), 0);
}

export function spendBetween(snapshot: Snapshot, from: ISODate, to: ISODate, opts: { everydayOnly?: boolean } = {}): Txn[] {
  const list = liveTxns(snapshot).filter((t) => t.date >= from && t.date <= to);
  return opts.everydayOnly ? discretionary(list) : list.filter((t) => t.type === 'spend' || t.type === 'refund');
}

/**
 * Typical everyday spending per day, learned from the last four weeks.
 * Returns undefined until there is at least a week of history, so callers can
 * fall back to the safe-to-spend allowance instead of guessing.
 */
export function typicalDailySpend(snapshot: Snapshot, today: ISODate): Cents | undefined {
  const txns = liveTxns(snapshot);
  const first = txns.reduce<ISODate | undefined>((min, t) => (!min || t.date < min ? t.date : min), undefined);
  if (!first || daysBetween(first, today) < 7) return undefined;
  const span = Math.min(28, daysBetween(first, today));
  const from = addDays(today, -span);
  const total = netSpend(spendBetween(snapshot, from, addDays(today, -1), { everydayOnly: true }));
  return Math.max(0, Math.round(total / span)) as Cents;
}

/** Average everyday spend for each weekday (0 = Sunday) over the last eight weeks. */
export function spendByWeekday(snapshot: Snapshot, today: ISODate): number[] {
  const totals = Array.from({ length: 7 }, () => 0);
  for (const t of spendBetween(snapshot, addDays(today, -56), addDays(today, -1), { everydayOnly: true })) {
    totals[weekday(t.date)]! += t.type === 'spend' ? t.amount : -t.amount;
  }
  return totals.map((t) => Math.round(t / 8));
}

export function spendByCategory(txns: readonly Txn[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== 'spend' && t.type !== 'refund') continue;
    const key = t.categoryId ?? 'uncategorized';
    map.set(key, (map.get(key) ?? 0) + (t.type === 'spend' ? t.amount : -t.amount));
  }
  return map;
}
