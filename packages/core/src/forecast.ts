import { addDays } from './dates';
import type { Cents } from './money';
import { nextOccurrence } from './recurrence';
import { goalSetAsides, safeToSpend } from './safe-to-spend';
import { paychecks, scheduleBetween } from './schedule';
import { typicalDailySpend } from './spending';
import type { ISODate, Snapshot } from './types';

export type ForecastEventKind = 'income' | 'bill' | 'debt' | 'goal' | 'purchase';

export interface ForecastEvent {
  name: string;
  /** Signed: money in is positive. */
  amount: Cents;
  kind: ForecastEventKind;
}

export interface ForecastDay {
  date: ISODate;
  balance: Cents;
  events: ForecastEvent[];
}

export interface Forecast {
  days: ForecastDay[];
  start: Cents;
  lowest: ForecastDay;
  end: ForecastDay;
  /** Buffer plus goal money set aside: the line the balance should stay above. */
  protectedAmount: Cents;
  dailySpend: Cents;
  learnedDailySpend: boolean;
  firstDayBelowProtected?: ISODate;
}

export interface WhatIf {
  amount: Cents;
  date: ISODate;
  name?: string;
}

export function forecast(snapshot: Snapshot, today: ISODate, length: number, whatIf?: WhatIf): Forecast {
  const sts = safeToSpend(snapshot, today);
  const learned = typicalDailySpend(snapshot, today);
  const dailySpend = (learned ?? sts.perDay) as Cents;
  const end = addDays(today, length - 1);
  const items = scheduleBetween(snapshot, today, end);
  const goalItems = goalSetAsides(snapshot, undefined, paychecks(snapshot)[0]?.frequency ?? 'monthly');

  // Paydays when goal money is moved aside.
  const paydays = new Set<ISODate>();
  for (const r of paychecks(snapshot)) {
    let d = nextOccurrence(r, addDays(today, -1));
    while (d && d <= end) {
      paydays.add(d);
      d = nextOccurrence(r, d);
    }
  }

  let balance = sts.accounts as number;
  const days: ForecastDay[] = [];
  const goalRemaining = new Map(snapshot.goals.map(g => [g.id, Math.max(0, g.target - g.saved)]));
  const reserveGoal = (g: { goalId: string; name: string; amount: Cents }, events: ForecastEvent[]) => {
    const amount = Math.min(g.amount, goalRemaining.get(g.goalId) ?? 0);
    if (amount <= 0) return;
    events.push({ name: g.name, amount: -amount as Cents, kind: 'goal' });
    goalRemaining.set(g.goalId, (goalRemaining.get(g.goalId) ?? 0) - amount);
  };
  for (let i = 0; i < length; i++) {
    const date = addDays(today, i);
    const events: ForecastEvent[] = [];
    if (i === 0) {
      // Bills still due this period that are overdue land today.
      for (const due of [...sts.billItems, ...sts.debtItems]) {
        if (due.date < today) events.push({ name: due.name, amount: -due.amount as Cents, kind: due.kind === 'debt-minimum' || due.kind === 'debt' ? 'debt' : 'bill' });
      }
      for (const g of sts.goalItems) reserveGoal(g, events);
    }
    for (const item of items) {
      if (item.date !== date || item.paid || (item.autopay && item.date < today)) continue;
      const kind: ForecastEventKind = item.isIncome ? 'income' : item.kind === 'debt-minimum' || item.kind === 'debt' ? 'debt' : 'bill';
      events.push({ name: item.name, amount: (item.isIncome ? item.amount : -item.amount) as Cents, kind });
    }
    if (i > 0 && paydays.has(date)) {
      for (const g of goalItems) reserveGoal(g, events);
    }
    if (whatIf && whatIf.date === date) {
      events.push({ name: whatIf.name ?? 'This purchase', amount: -whatIf.amount as Cents, kind: 'purchase' });
    }
    const everyday = i === 0 ? Math.max(0, dailySpend - sts.spentToday) : dailySpend;
    balance += events.reduce((s, e) => s + e.amount, 0) - everyday;
    days.push({ date, balance: balance as Cents, events });
  }

  const protectedAmount = (snapshot.settings.buffer + sts.goals) as Cents;
  const lowest = days.reduce((low, d) => (d.balance < low.balance ? d : low), days[0]!);
  return {
    days,
    start: sts.accounts,
    lowest,
    end: days[days.length - 1]!,
    protectedAmount,
    dailySpend,
    learnedDailySpend: learned !== undefined,
    firstDayBelowProtected: days.find((d) => d.balance < snapshot.settings.buffer)?.date,
  };
}

export type AffordVerdict = 'yes' | 'stretch' | 'not-now';

export interface Affordability {
  verdict: AffordVerdict;
  leftTodayAfter: Cents;
  perDayAfter: Cents;
  lowestAfter: ForecastDay;
  /** How much short of the money needed before payday it would leave you (0 if it fits). */
  shortBy: Cents;
}

/** "Can I afford…?" — compares a purchase with today's money and the forecast's lowest point. */
export function canIAfford(snapshot: Snapshot, today: ISODate, amount: Cents, date: ISODate = today): Affordability {
  const sts = safeToSpend(snapshot, today);
  const f = forecast(snapshot, today, 45, { amount, date });
  const untilAfter = sts.untilPayday - amount;
  const perDayAfter = Math.max(0, Math.floor((untilAfter + sts.spentToday) / sts.daysLeft)) as Cents;
  // If it still fits before payday, the remaining days simply get a smaller allowance.
  const shortBy = Math.max(0, -untilAfter) as Cents;
  const verdict: AffordVerdict = date === today && amount <= sts.leftToday ? 'yes' : untilAfter >= 0 ? 'stretch' : 'not-now';
  return {
    verdict,
    leftTodayAfter: (sts.leftToday - (date === today ? amount : 0)) as Cents,
    perDayAfter,
    lowestAfter: f.lowest,
    shortBy,
  };
}
