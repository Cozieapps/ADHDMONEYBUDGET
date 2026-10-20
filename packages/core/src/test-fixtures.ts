import { defaultCategories, defaultSettings } from './factory';
import type { Cents } from './money';
import type { Account, Debt, Goal, Repeat, Snapshot, Txn } from './types';

export const c = (dollars: number) => Math.round(dollars * 100) as Cents;

export function snapshot(partial: Partial<Snapshot> = {}): Snapshot {
  return {
    settings: { ...defaultSettings(0), buffer: c(200), setupDone: true },
    accounts: [],
    categories: defaultCategories(0),
    txns: [],
    repeats: [],
    budgets: [],
    goals: [],
    debts: [],
    waits: [],
    wins: [],
    ...partial,
  };
}

let n = 0;
const base = () => ({ id: `id-${++n}`, updatedAt: 0, source: 'app' as const });

export function account(p: Partial<Account> = {}): Account {
  return { ...base(), name: 'Checking', type: 'checking', balance: c(1000), checkedAt: 0, checkedOn: '2026-10-01', spendable: true, ...p };
}

export function repeat(p: Partial<Repeat> = {}): Repeat {
  return {
    ...base(),
    name: 'Bill',
    kind: 'bill',
    amount: c(100),
    frequency: 'monthly',
    anchor: '2026-01-01',
    autopay: false,
    remindDaysBefore: 2,
    paid: [],
    active: true,
    ...p,
  };
}

export function txn(p: Partial<Txn> = {}): Txn {
  return { ...base(), date: '2026-10-20', amount: c(10), type: 'spend', tags: [], createdAt: 1, ...p };
}

export function goal(p: Partial<Goal> = {}): Goal {
  return { ...base(), name: 'Goal', emoji: '🌴', tone: 'mint', kind: 'goal', target: c(1000), saved: c(0), monthly: c(100), ...p };
}

export function debt(p: Partial<Debt> = {}): Debt {
  return { ...base(), name: 'Card', balance: c(1000), apr: 20, minimum: c(50), dueDay: 25, paidMonths: [], ...p };
}
