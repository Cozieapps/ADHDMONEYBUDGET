import { addMonths } from './dates';
import type { Cents } from './money';
import type { Debt, DebtStrategy, ISODate } from './types';

export interface PayoffOptions {
  strategy: DebtStrategy;
  extra: Cents;
  customOrder?: string[];
  start: ISODate;
  /** When a debt is paid off, roll its minimum into the next one. */
  rollover?: boolean;
}

export interface PayoffResult {
  months: number;
  totalInterest: Cents;
  debtFreeDate: ISODate;
  order: string[];
  /** Total balance at the start of each month, starting now. */
  series: { date: ISODate; balance: Cents }[];
  payoffDates: Record<string, ISODate>;
  /** True when payments don't cover interest and it would never finish. */
  neverEnds: boolean;
}

const MAX_MONTHS = 600;

export function payoffOrder(debts: readonly Debt[], strategy: DebtStrategy, customOrder: string[] = []): string[] {
  const live = debts.filter((d) => !d.deletedAt && d.balance > 0);
  if (strategy === 'snowball') return [...live].sort((a, b) => a.balance - b.balance || b.apr - a.apr).map((d) => d.id);
  if (strategy === 'avalanche') return [...live].sort((a, b) => b.apr - a.apr || a.balance - b.balance).map((d) => d.id);
  const ranked = customOrder.filter((id) => live.some((d) => d.id === id));
  return [...ranked, ...live.filter((d) => !ranked.includes(d.id)).map((d) => d.id)];
}

export function simulatePayoff(debts: readonly Debt[], options: PayoffOptions): PayoffResult {
  const rollover = options.rollover ?? true;
  const order = payoffOrder(debts, options.strategy, options.customOrder);
  const state = new Map(debts.filter((d) => order.includes(d.id)).map((d) => [d.id, { ...d, left: d.balance as number }]));
  const budget = [...state.values()].reduce((s, d) => s + d.minimum, 0) + options.extra;
  const series: PayoffResult['series'] = [{ date: options.start, balance: total() as Cents }];
  const payoffDates: Record<string, ISODate> = {};
  let interest = 0;
  let month = 0;

  function total() {
    let t = 0;
    for (const d of state.values()) t += Math.max(0, d.left);
    return t;
  }

  while (total() > 0 && month < MAX_MONTHS) {
    month += 1;
    for (const d of state.values()) {
      if (d.left <= 0) continue;
      const i = Math.round((d.left * d.apr) / 100 / 12);
      d.left += i;
      interest += i;
    }
    let pool = rollover ? budget : Infinity;
    for (const d of state.values()) {
      if (d.left <= 0) continue;
      const pay = Math.min(d.minimum, d.left);
      d.left -= pay;
      if (rollover) pool -= pay;
    }
    if (rollover) {
      for (const id of order) {
        const d = state.get(id)!;
        if (pool <= 0) break;
        if (d.left <= 0) continue;
        const pay = Math.min(pool, d.left);
        d.left -= pay;
        pool -= pay;
      }
    }
    const date = addMonths(options.start, month);
    for (const d of state.values()) if (d.left <= 0 && !payoffDates[d.id]) payoffDates[d.id] = date;
    series.push({ date, balance: total() as Cents });
  }

  return {
    months: month,
    totalInterest: interest as Cents,
    debtFreeDate: addMonths(options.start, month),
    order,
    series,
    payoffDates,
    neverEnds: total() > 0,
  };
}

/** Minimums only, no rollover: the "if nothing changes" comparison. */
export function minimumsOnly(debts: readonly Debt[], start: ISODate): PayoffResult {
  return simulatePayoff(debts, { strategy: 'avalanche', extra: 0 as Cents, start, rollover: false });
}
