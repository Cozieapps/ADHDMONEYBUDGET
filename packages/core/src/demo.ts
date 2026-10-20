import { addDays, addMonths, dayOfMonth, monthKey, weekday } from './dates';
import { budgetId, defaultCategories, defaultSettings } from './factory';
import type { Cents } from './money';
import { occurrences } from './recurrence';
import type { Account, Budget, Debt, Goal, ISODate, Repeat, Snapshot, Tone, Txn, WaitItem } from './types';

// A believable six weeks for "Explore with example data". Deterministic, so
// screenshots and tests are stable, and dated relative to today.

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const c = (dollars: number) => Math.round(dollars * 100) as Cents;
const at = (date: ISODate, hour: number, minute = 0) => new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`).getTime();

export function buildDemo(today: ISODate, now = Date.now()): Snapshot {
  const random = rng(20261020);
  const between = (min: number, max: number) => min + random() * (max - min);
  let n = 0;
  const id = (prefix: string) => `demo-${prefix}-${++n}`;
  const base = (prefix: string) => ({ id: id(prefix), updatedAt: now, source: 'app' as const });

  const settings = {
    ...defaultSettings(now),
    name: 'Jordan',
    setupDone: true,
    setupStep: 99,
    buffer: c(200),
    debtExtra: c(150),
    demo: true,
    challenge52: { startedOn: addDays(today, -7 * 9), done: [1, 2, 3, 4, 5, 6, 7, 8, 9], reverse: false },
  };
  const categories = defaultCategories(now);

  const checkedAt = Math.min(now, at(today, 8, 10));
  const accounts: Account[] = [
    { ...base('acct'), name: 'Everyday checking', type: 'checking', balance: c(1486.2), checkedAt, checkedOn: today, spendable: true },
    { ...base('acct'), name: 'Cash', type: 'cash', balance: c(42), checkedAt, checkedOn: today, spendable: true },
    { ...base('acct'), name: 'Savings', type: 'savings', balance: c(4090), checkedAt, checkedOn: today, spendable: false },
  ];
  const checking = accounts[0]!.id;

  const monthlyOn = (date: ISODate) => addMonths(date, -3);
  const repeats: Repeat[] = [];
  const addRepeat = (r: Omit<Repeat, keyof ReturnType<typeof base> | 'paid' | 'active' | 'remindDaysBefore'> & Partial<Repeat>) => {
    const full: Repeat = { ...base('rep'), paid: [], active: true, remindDaysBefore: 2, accountId: checking, ...r };
    repeats.push(full);
    return full;
  };

  const paycheck = addRepeat({ name: 'Paycheck', kind: 'income', amount: c(2100), frequency: 'biweekly', anchor: addDays(today, -6 - 28), isPaycheck: true, autopay: false, categoryId: 'cat-income-paycheck' });
  addRepeat({ name: 'Etsy payout', kind: 'income', amount: c(85), frequency: 'monthly', anchor: monthlyOn(addDays(today, 4)), autopay: false, categoryId: 'cat-income-side-income' });
  addRepeat({ name: 'Rent', kind: 'bill', amount: c(1250), frequency: 'monthly', anchor: '2026-01-01', autopay: false, categoryId: 'cat-spend-home' });
  addRepeat({ name: 'Electricity', kind: 'bill', amount: c(73), frequency: 'monthly', anchor: monthlyOn(addDays(today, 1)), autopay: false, categoryId: 'cat-spend-bills-utilities' });
  addRepeat({ name: 'Phone', kind: 'bill', amount: c(45), frequency: 'monthly', anchor: monthlyOn(addDays(today, 12)), autopay: false, categoryId: 'cat-spend-bills-utilities' });
  addRepeat({ name: 'Internet', kind: 'bill', amount: c(60), frequency: 'monthly', anchor: monthlyOn(addDays(today, 5)), autopay: true, categoryId: 'cat-spend-bills-utilities' });
  addRepeat({ name: 'Car insurance', kind: 'bill', amount: c(112), frequency: 'monthly', anchor: monthlyOn(addDays(today, 20)), autopay: false, categoryId: 'cat-spend-bills-utilities' });
  addRepeat({ name: 'Renter’s insurance', kind: 'bill', amount: c(18), frequency: 'monthly', anchor: monthlyOn(addDays(today, 15)), autopay: true, categoryId: 'cat-spend-bills-utilities' });
  addRepeat({ name: 'Spotify', kind: 'subscription', amount: c(11.99), frequency: 'monthly', anchor: monthlyOn(addDays(today, -3)), autopay: true, categoryId: 'cat-spend-subscriptions' });
  addRepeat({ name: 'Netflix', kind: 'subscription', amount: c(15.49), frequency: 'monthly', anchor: monthlyOn(addDays(today, 9)), autopay: true, categoryId: 'cat-spend-subscriptions' });
  addRepeat({ name: 'Gym', kind: 'subscription', amount: c(29), frequency: 'monthly', anchor: monthlyOn(addDays(today, 2)), autopay: true, categoryId: 'cat-spend-subscriptions' });

  const txns: Txn[] = [];
  const log = (date: ISODate, amount: Cents, type: Txn['type'], categoryId: string, extra: Partial<Txn> = {}, hour = 12) => {
    const createdAt = date === today ? Math.min(now, Math.max(checkedAt + 60_000, at(date, hour))) : at(date, hour, Math.floor(random() * 59));
    txns.push({ ...base('txn'), date, amount, type, categoryId, accountId: checking, tags: [], createdAt, ...extra });
  };

  // Past bills and paychecks are ticked off and logged.
  const start = addDays(today, -44);
  for (const r of repeats) {
    for (const date of occurrences(r, start, addDays(today, -1))) {
      r.paid.push(date);
      log(date, r.amount, r.kind === 'income' ? 'income' : 'spend', r.categoryId!, { note: r.name, repeatId: r.id }, 9);
    }
  }
  // Today's autopay (if any) stays for the app to pick up.

  for (let i = 44; i >= 1; i--) {
    const date = addDays(today, -i);
    const wd = weekday(date);
    if (wd >= 1 && wd <= 5 && random() < 0.8) log(date, c(3.8), 'spend', 'cat-spend-coffee-treats', { note: 'Coffee', merchant: 'Bean There' }, 8);
    if ((wd === 2 || wd === 4) && random() < 0.85) log(date, c(9.5), 'spend', 'cat-spend-eating-out', { note: 'Lunch' }, 13);
    if (wd === 6) log(date, c(between(62, 96)), 'spend', 'cat-spend-groceries', { merchant: 'Trader Joe’s', note: 'Groceries' }, 11);
    if (wd === 5 && random() < 0.75) log(date, c(between(26, 44)), 'spend', 'cat-spend-eating-out', { note: 'Dinner out', tags: ['going-out'] }, 19);
    if (i % 9 === 3) log(date, c(between(38, 49)), 'spend', 'cat-spend-transport', { merchant: 'Shell', note: 'Gas' }, 17);
    if (i % 7 === 2 && random() < 0.8) log(date, c(between(9, 28)), 'spend', 'cat-spend-shopping', { merchant: 'Amazon', note: 'Amazon order' }, 22);
    if (i % 11 === 5) log(date, c(between(12, 24)), 'spend', 'cat-spend-fun', { note: random() < 0.5 ? 'Movie' : 'Books' }, 20);
    if (i === 17) log(date, c(45), 'spend', 'cat-spend-self-care', { note: 'Nails' }, 16);
    if (i === 23) log(date, c(18.6), 'spend', 'cat-spend-health', { merchant: 'CVS', note: 'Pharmacy' }, 18);
    if (i === 8) log(date, c(32), 'spend', 'cat-spend-gifts', { note: 'Birthday gift for Ana', tags: ['birthday'] }, 15);
  }
  log(today, c(3.8), 'spend', 'cat-spend-coffee-treats', { note: 'Coffee', merchant: 'Bean There' }, 9);

  const budgets: Budget[] = (
    [
      ['cat-spend-groceries', 475],
      ['cat-spend-eating-out', 220],
      ['cat-spend-coffee-treats', 70],
      ['cat-spend-transport', 180],
      ['cat-spend-shopping', 120],
      ['cat-spend-fun', 100],
      ['cat-spend-self-care', 60],
      ['cat-spend-health', 50],
    ] as const
  ).map(([categoryId, amount]) => ({ ...base('budget'), id: budgetId(categoryId), categoryId, monthly: c(amount) }));

  const lastPayday = addDays(today, -6);
  const goal = (name: string, emoji: string, tone: Tone, kind: Goal['kind'], target: number, saved: number, monthly: number, extra: Partial<Goal> = {}): Goal => ({
    ...base('goal'),
    name,
    emoji,
    tone,
    kind,
    target: c(target),
    saved: c(saved),
    monthly: c(monthly),
    ...extra,
  });
  const goals = [
    goal('Emergency fund', '🛟', 'sky', 'emergency', 5000, 3100, 250, { lastAddedOn: lastPayday }),
    goal('Portugal trip', '🌍', 'peach', 'goal', 1200, 350, 150, { targetDate: addMonths(today, 7) }),
    goal('New laptop', '💻', 'lavender', 'goal', 1400, 640, 80),
  ];

  const debts: Debt[] = [
    { ...base('debt'), name: 'Visa card', balance: c(3900), apr: 24.99, minimum: c(95), dueDay: dayOfMonth(addDays(today, 4)), paidMonths: [monthKey(addDays(today, -30))] },
    { ...base('debt'), name: 'Car loan', balance: c(8200), apr: 6.9, minimum: c(260), dueDay: dayOfMonth(addDays(today, -8)), paidMonths: [monthKey(addDays(today, -8))] },
  ];

  const waits: WaitItem[] = [
    { ...base('wait'), name: 'Air fryer', amount: c(89), addedAt: now - 20 * 3_600_000, decideAfter: now + 28 * 3_600_000, status: 'waiting' },
    { ...base('wait'), name: 'Desk lamp', amount: c(35), addedAt: now - 50 * 3_600_000, decideAfter: now - 2 * 3_600_000, status: 'waiting' },
    { ...base('wait'), name: 'Cozy sweater', amount: c(64), addedAt: now - 9 * 86_400_000, decideAfter: now - 7 * 86_400_000, status: 'skipped', decidedAt: now - 6 * 86_400_000 },
  ];

  void paycheck;
  return { settings, accounts, categories, txns, repeats, budgets, goals, debts, waits, wins: [] };
}
