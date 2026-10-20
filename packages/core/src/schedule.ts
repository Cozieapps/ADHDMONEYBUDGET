import { addDays, dateInMonth, monthIndex, monthKey, startOfMonth } from './dates';
import type { Cents } from './money';
import { nextOccurrence, occurrences, PAY_PERIODS_PER_YEAR, previousOccurrence } from './recurrence';
import type { Frequency, ISODate, Repeat, Snapshot } from './types';

export type DueKind = Repeat['kind'] | 'debt-minimum';

export interface DueItem {
  key: string;
  date: ISODate;
  name: string;
  amount: Cents;
  kind: DueKind;
  /** repeat id or debt id */
  refId: string;
  paid: boolean;
  autopay: boolean;
  isIncome: boolean;
}

/** Bills, subscriptions, income and debt minimums between two dates (inclusive). */
export function scheduleBetween(snapshot: Snapshot, from: ISODate, to: ISODate): DueItem[] {
  const items: DueItem[] = [];
  for (const r of snapshot.repeats) {
    if (r.deletedAt) continue;
    for (const date of occurrences(r, from, to)) {
      items.push({
        key: `${r.id}:${date}`,
        date,
        name: r.name,
        amount: r.amount,
        kind: r.kind,
        refId: r.id,
        paid: r.paid.includes(date),
        autopay: r.autopay,
        isIncome: r.kind === 'income',
      });
    }
  }
  for (const d of snapshot.debts) {
    if (d.deletedAt || d.balance <= 0) continue;
    let { year, month } = monthIndex(from);
    for (;;) {
      const date = dateInMonth(year, month, d.dueDay);
      if (startOfMonth(date) > to) break;
      if (date >= from && date <= to) {
        items.push({
          key: `${d.id}:${date}`,
          date,
          name: d.name,
          amount: Math.min(d.minimum, d.balance) as Cents,
          kind: 'debt-minimum',
          refId: d.id,
          paid: d.paidMonths.includes(monthKey(date)),
          autopay: false,
          isIncome: false,
        });
      }
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return items.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date < b.date ? -1 : 1));
}

export interface PayPeriod {
  /** First day of the current pay period. */
  start: ISODate;
  /** Next payday (first day of the next period). */
  nextPayday: ISODate;
  /** True when a paycheck repeat defines the period; otherwise calendar months are used. */
  fromPaycheck: boolean;
  paycheckName?: string;
  paycheckAmount?: Cents;
  frequency: Frequency;
}

export function paychecks(snapshot: Snapshot): Repeat[] {
  return snapshot.repeats.filter((r) => !r.deletedAt && r.active && r.kind === 'income' && r.isPaycheck);
}

export function payPeriod(snapshot: Snapshot, today: ISODate): PayPeriod {
  let best: { next: ISODate; prev?: ISODate; repeat: Repeat } | undefined;
  for (const r of paychecks(snapshot)) {
    const next = nextOccurrence(r, today);
    if (!next) continue;
    if (!best || next < best.next) best = { next, prev: previousOccurrence(r, today), repeat: r };
  }
  if (best) {
    return {
      start: best.prev ?? today,
      nextPayday: best.next,
      fromPaycheck: true,
      paycheckName: best.repeat.name,
      paycheckAmount: best.repeat.amount,
      frequency: best.repeat.frequency,
    };
  }
  const { year, month } = monthIndex(today);
  return {
    start: startOfMonth(today),
    nextPayday: month === 12 ? dateInMonth(year + 1, 1, 1) : dateInMonth(year, month + 1, 1),
    fromPaycheck: false,
    frequency: 'monthly',
  };
}

/** How many pay periods there are per month on average (for "per paycheck" views). */
export function periodsPerMonth(frequency: Frequency): number {
  return PAY_PERIODS_PER_YEAR[frequency] / 12;
}

/** Items in the window that still need money set aside. */
export function stillDue(items: readonly DueItem[], today: ISODate): DueItem[] {
  return items.filter((i) => !i.isIncome && !i.paid && !(i.autopay && i.date < today));
}

export function windowBeforePayday(period: PayPeriod): [ISODate, ISODate] {
  return [period.start, addDays(period.nextPayday, -1)];
}
