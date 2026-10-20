import { addDays, monthKey } from './dates';
import { meta, repeatTxnId } from './factory';
import type { Cents } from './money';
import { occurrences } from './recurrence';
import type { Debt, Goal, ISODate, Repeat, Snapshot, Source, Txn } from './types';

// Pure record operations shared by the app and the Claude connector, so both
// change data in exactly the same way.

export interface NewTxn {
  date: ISODate;
  amount: Cents;
  type: Txn['type'];
  categoryId?: string;
  accountId?: string;
  merchant?: string;
  note?: string;
  tags?: string[];
}

export function createTxn(input: NewTxn, source: Source = 'app', now = Date.now()): Txn {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new RangeError('amount must be a positive number of cents');
  const txn: Txn = { ...meta(source, now), date: input.date, amount: input.amount, type: input.type, tags: input.tags ?? [], createdAt: now };
  if (input.categoryId) txn.categoryId = input.categoryId;
  if (input.accountId) txn.accountId = input.accountId;
  if (input.merchant) txn.merchant = input.merchant;
  if (input.note) txn.note = input.note;
  return txn;
}

export interface Change {
  put: (Repeat | Txn | Goal | Debt)[];
}

/** Ticks off a bill (or marks income as arrived) and logs the matching transaction. */
export function markRepeatPaid(repeat: Repeat, date: ISODate, source: Source = 'app', now = Date.now()): { repeat: Repeat; txn: Txn } {
  const updated: Repeat = { ...repeat, paid: [...new Set([...repeat.paid, date])].sort(), updatedAt: now, source };
  const txn = createTxn(
    {
      date,
      amount: repeat.amount,
      type: repeat.kind === 'income' ? 'income' : repeat.kind === 'saving' ? 'transfer' : 'spend',
      note: repeat.name,
      ...(repeat.categoryId ? { categoryId: repeat.categoryId } : {}),
      ...(repeat.accountId ? { accountId: repeat.accountId } : {}),
    },
    source,
    now,
  );
  txn.repeatId = repeat.id;
  // Same id on every device, so a bill ticked (or auto-logged) twice syncs as one transaction.
  txn.id = repeatTxnId(repeat.id, date);
  return { repeat: updated, txn };
}

/** Undoes a tick: removes the paid date and soft-deletes the transaction it created. */
export function unmarkRepeatPaid(snapshot: Snapshot, repeat: Repeat, date: ISODate, now = Date.now()): { repeat: Repeat; txns: Txn[] } {
  const updated: Repeat = { ...repeat, paid: repeat.paid.filter((d) => d !== date), updatedAt: now };
  const txns = snapshot.txns
    .filter((t) => !t.deletedAt && t.repeatId === repeat.id && t.date === date)
    .map((t) => ({ ...t, deletedAt: now, updatedAt: now }));
  return { repeat: updated, txns };
}

/** Autopay bills whose date has come and that haven't been logged yet. */
export function autopayDue(snapshot: Snapshot, today: ISODate): { repeat: Repeat; date: ISODate }[] {
  const out: { repeat: Repeat; date: ISODate }[] = [];
  for (const r of snapshot.repeats) {
    if (r.deletedAt || !r.autopay || r.kind === 'income') continue;
    for (const date of occurrences(r, addDays(today, -35), today)) {
      if (!r.paid.includes(date)) out.push({ repeat: r, date });
    }
  }
  return out;
}

export function addToGoal(goal: Goal, amount: Cents, today: ISODate, source: Source = 'app', now = Date.now()): { goal: Goal; txn: Txn } {
  const updated: Goal = { ...goal, saved: (goal.saved + amount) as Cents, lastAddedOn: today, updatedAt: now, source };
  const txn = createTxn({ date: today, amount, type: 'transfer', note: `Added to ${goal.name}` }, source, now);
  txn.goalId = goal.id;
  return { goal: updated, txn };
}

export function takeFromGoal(goal: Goal, amount: Cents, today: ISODate, source: Source = 'app', now = Date.now()): { goal: Goal; txn: Txn } {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError('amount must be a positive number of cents');
  if (goal.saved <= 0) throw new RangeError('there is no saved money to withdraw from this goal');
  const take = Math.min(amount, goal.saved) as Cents;
  const updated: Goal = { ...goal, saved: (goal.saved - take) as Cents, updatedAt: now, source };
  const txn = createTxn({ date: today, amount: take, type: 'transfer', note: `Taken from ${goal.name}` }, source, now);
  txn.goalId = goal.id;
  txn.inbound = true;
  return { goal: updated, txn };
}

/** Records a debt payment: lowers the balance, ticks the month, and logs the money leaving checking. */
export function payDebt(debt: Debt, amount: Cents, date: ISODate, source: Source = 'app', now = Date.now()): { debt: Debt; txn: Txn } {
  const pay = Math.min(amount, debt.balance) as Cents;
  const updated: Debt = {
    ...debt,
    balance: (debt.balance - pay) as Cents,
    paidMonths: pay >= Math.min(debt.minimum, debt.balance) ? [...new Set([...debt.paidMonths, monthKey(date)])] : debt.paidMonths,
    updatedAt: now,
    source,
  };
  const txn = createTxn({ date, amount: pay, type: 'transfer', note: `${debt.name} payment` }, source, now);
  txn.debtId = debt.id;
  return { debt: updated, txn };
}
