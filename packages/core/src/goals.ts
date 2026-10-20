import { addMonths, daysBetween } from './dates';
import type { Cents } from './money';
import { monthlyEquivalent } from './recurrence';
import { liveTxns, netSpend, discretionary } from './spending';
import { addDays } from './dates';
import type { Goal, ISODate, Snapshot } from './types';

export function remaining(goal: Goal): Cents {
  return Math.max(0, goal.target - goal.saved) as Cents;
}

export function progress(goal: Goal): number {
  return goal.target > 0 ? Math.min(1, goal.saved / goal.target) : 0;
}

/** Months until the goal is reached at the current monthly amount, or undefined if it never will be. */
export function monthsToGoal(goal: Goal): number | undefined {
  const left = remaining(goal);
  if (left === 0) return 0;
  if (goal.monthly <= 0) return undefined;
  return Math.ceil(left / goal.monthly);
}

export function etaDate(goal: Goal, today: ISODate): ISODate | undefined {
  const months = monthsToGoal(goal);
  return months === undefined ? undefined : addMonths(today, months);
}

/** Monthly amount needed to hit the target date. */
export function monthlyNeeded(goal: Goal, today: ISODate): Cents | undefined {
  if (!goal.targetDate) return undefined;
  const months = Math.max(1, Math.round(daysBetween(today, goal.targetDate) / 30.44));
  return Math.ceil(remaining(goal) / months) as Cents;
}

/** Typical monthly cost of life: recurring must-pays plus everyday spending (last 90 days). */
export function monthlyEssentials(snapshot: Snapshot, today: ISODate): Cents {
  const recurring = snapshot.repeats
    .filter((r) => !r.deletedAt && r.active && r.kind !== 'income' && r.kind !== 'saving')
    .reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0);
  const minimums = snapshot.debts.filter((d) => !d.deletedAt && d.balance > 0).reduce((s, d) => s + d.minimum, 0);
  const txns = liveTxns(snapshot);
  const first = txns.reduce<ISODate | undefined>((min, t) => (!min || t.date < min ? t.date : min), undefined);
  let everyday = 0;
  if (first) {
    const span = Math.min(90, Math.max(1, daysBetween(first, today)));
    const recent = discretionary(txns.filter((t) => t.date >= addDays(today, -span) && t.date < today));
    everyday = Math.round((netSpend(recent) / span) * 30.44);
  }
  return (recurring + minimums + Math.max(0, everyday)) as Cents;
}

export interface SafetyNet {
  saved: Cents;
  monthlyCost: Cents;
  monthsCovered: number;
  targetMonths: number;
  targetAmount: Cents;
}

export function safetyNet(snapshot: Snapshot, today: ISODate, targetMonths = 3): SafetyNet {
  const saved = snapshot.goals
    .filter((g) => !g.deletedAt && g.kind === 'emergency')
    .reduce((s, g) => s + g.saved, 0) as Cents;
  const monthlyCost = monthlyEssentials(snapshot, today);
  return {
    saved,
    monthlyCost,
    monthsCovered: monthlyCost > 0 ? saved / monthlyCost : 0,
    targetMonths,
    targetAmount: (monthlyCost * targetMonths) as Cents,
  };
}

/** Classic 52-week challenge: week n saves $n (or reversed, starting at $52). */
export function challengeAmount(week: number, reverse: boolean): Cents {
  return ((reverse ? 53 - week : week) * 100) as Cents;
}
