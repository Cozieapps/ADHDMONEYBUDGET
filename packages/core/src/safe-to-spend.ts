import { spendableBalance } from './balances';
import { daysBetween } from './dates';
import type { Cents } from './money';
import { PAY_PERIODS_PER_YEAR } from './recurrence';
import { type DueItem, payPeriod, scheduleBetween, stillDue, windowBeforePayday } from './schedule';
import type { ISODate, Snapshot } from './types';

export interface GoalSetAside {
  goalId: string;
  name: string;
  amount: Cents;
}

export interface SafeToSpend {
  today: ISODate;
  nextPayday: ISODate;
  paydayKnown: boolean;
  daysLeft: number;
  accounts: Cents;
  incoming: Cents;
  bills: Cents;
  debts: Cents;
  goals: Cents;
  buffer: Cents;
  /** Can be negative: that is a plan problem to solve, never an error state. */
  untilPayday: Cents;
  spentToday: Cents;
  /** Today's allowance before today's spending. */
  perDay: Cents;
  /** What's left to spend today. Negative means today went over. */
  leftToday: Cents;
  billItems: DueItem[];
  debtItems: DueItem[];
  incomeItems: DueItem[];
  goalItems: GoalSetAside[];
  status: 'good' | 'tight' | 'over';
}

/** Remaining goal money to protect in a period; undefined starts a fresh future allocation. */
export function goalSetAsides(
  snapshot: Snapshot,
  periodStart: ISODate | undefined,
  frequency: keyof typeof PAY_PERIODS_PER_YEAR,
  through?: ISODate,
): GoalSetAside[] {
  const perYear = PAY_PERIODS_PER_YEAR[frequency];
  const contributed = new Map<string, number>();
  if (periodStart !== undefined) {
    for (const txn of snapshot.txns) {
      if (txn.deletedAt || txn.type !== 'transfer' || !txn.goalId || txn.date < periodStart || (through && txn.date > through)) continue;
      contributed.set(txn.goalId, (contributed.get(txn.goalId) ?? 0) + (txn.inbound ? -txn.amount : txn.amount));
    }
  }
  return snapshot.goals
    .filter((g) => !g.deletedAt && !g.archived && g.monthly > 0 && g.saved < g.target)
    .map((g) => {
      // A last-added date cannot prove how much was funded. Actual live transfers
      // count once, even after a bank balance is reconciled. Older savings taken
      // back do not create a new obligation beyond this period's planned amount.
      const planned = Math.round((g.monthly * 12) / perYear);
      const remaining = Math.max(0, planned - Math.max(0, contributed.get(g.id) ?? 0));
      return { goalId: g.id, name: g.name, amount: Math.min(remaining, g.target - g.saved) as Cents };
    })
    .filter((g) => g.amount > 0);
}

export function safeToSpend(snapshot: Snapshot, today: ISODate): SafeToSpend {
  const period = payPeriod(snapshot, today);
  const [from, to] = windowBeforePayday(period);
  const items = scheduleBetween(snapshot, from, to);
  const due = stillDue(items, today);
  const billItems = due.filter((i) => i.kind !== 'debt-minimum' && i.kind !== 'debt');
  const debtItems = due.filter((i) => i.kind === 'debt-minimum' || i.kind === 'debt');
  const incomeItems = items.filter((i) => i.isIncome && !i.paid && i.date >= today);
  const expectedIncome = incomeItems.filter((i) => {
    const repeat = snapshot.repeats.find((r) => r.id === i.refId);
    return !repeat?.isPaycheck;
  });
  const goalItems = goalSetAsides(snapshot, period.start, period.frequency, today);

  const sum = (list: { amount: number }[]) => list.reduce((s, i) => s + i.amount, 0);
  const accounts = spendableBalance(snapshot);
  const incoming = sum(expectedIncome);
  const bills = sum(billItems);
  const debts = sum(debtItems);
  const goals = sum(goalItems);
  const buffer = snapshot.settings.buffer;
  const untilPayday = accounts + incoming - bills - debts - goals - buffer;

  const spentToday = snapshot.txns
    .filter((t) => !t.deletedAt && t.date === today)
    .reduce((s, t) => s + (t.type === 'spend' ? t.amount : t.type === 'refund' ? -t.amount : 0), 0);

  const daysLeft = Math.max(1, daysBetween(today, period.nextPayday));
  const perDay = Math.max(0, Math.floor((untilPayday + spentToday) / daysLeft));
  const leftToday = perDay - spentToday;

  return {
    today,
    nextPayday: period.nextPayday,
    paydayKnown: period.fromPaycheck,
    daysLeft,
    accounts,
    incoming: incoming as Cents,
    bills: bills as Cents,
    debts: debts as Cents,
    goals: goals as Cents,
    buffer,
    untilPayday: untilPayday as Cents,
    spentToday: spentToday as Cents,
    perDay: perDay as Cents,
    leftToday: leftToday as Cents,
    billItems,
    debtItems,
    incomeItems: expectedIncome,
    goalItems,
    status: untilPayday < 0 ? 'over' : leftToday <= 0 ? 'tight' : 'good',
  };
}
