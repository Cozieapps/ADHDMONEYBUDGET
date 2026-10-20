import { describe, expect, it } from 'vitest';
import { goalSetAsides, safeToSpend } from './safe-to-spend';
import { account, c, debt, goal, repeat, snapshot, txn } from './test-fixtures';

const TODAY = '2026-10-20';
const paycheck = repeat({ name: 'Paycheck', kind: 'income', isPaycheck: true, amount: c(2100), frequency: 'biweekly', anchor: '2026-10-02' });

describe('safeToSpend', () => {
  it('divides what is left until payday by the days left', () => {
    const s = safeToSpend(snapshot({ accounts: [account({ balance: c(1200) })], repeats: [paycheck] }), TODAY);
    expect(s.nextPayday).toBe('2026-10-30');
    expect(s.daysLeft).toBe(10);
    expect(s.untilPayday).toBe(c(1000)); // 1200 - 200 buffer
    expect(s.perDay).toBe(c(100));
    expect(s.leftToday).toBe(c(100));
    expect(s.status).toBe('good');
  });

  it('sets aside unpaid bills and debt minimums due before payday', () => {
    const rent = repeat({ name: 'Rent', amount: c(500), anchor: '2026-01-25' });
    const phone = repeat({ name: 'Phone', amount: c(50), anchor: '2026-01-05' }); // Nov 5 is after payday
    const card = debt({ minimum: c(40), dueDay: 28 });
    const s = safeToSpend(
      snapshot({ accounts: [account({ balance: c(1200) })], repeats: [paycheck, rent, phone], debts: [card] }),
      TODAY,
    );
    expect(s.bills).toBe(c(500));
    expect(s.debts).toBe(c(40));
    expect(s.untilPayday).toBe(c(1200 - 500 - 40 - 200));
  });

  it('stops counting a bill once it is ticked off', () => {
    const rent = repeat({ name: 'Rent', amount: c(500), anchor: '2026-01-25', paid: ['2026-10-25'] });
    const s = safeToSpend(snapshot({ accounts: [account({ balance: c(1200) })], repeats: [paycheck, rent] }), TODAY);
    expect(s.bills).toBe(0);
  });

  it('keeps an overdue manual bill this period, but assumes autopay already went out', () => {
    const manual = repeat({ name: 'Water', amount: c(30), anchor: '2026-01-18' });
    const auto = repeat({ name: 'Gym', amount: c(25), anchor: '2026-01-17', autopay: true });
    const s = safeToSpend(snapshot({ accounts: [account()], repeats: [paycheck, manual, auto] }), TODAY);
    expect(s.billItems.map((i) => i.name)).toEqual(['Water']);
  });

  it('sets aside one paycheck worth of goal money until it is added this period', () => {
    const trip = goal({ monthly: c(130) }); // biweekly: 130 * 12 / 26 = 60
    const s1 = safeToSpend(snapshot({ accounts: [account()], repeats: [paycheck], goals: [trip] }), TODAY);
    expect(s1.goals).toBe(c(60));
    const added = { ...trip, saved: c(60), lastAddedOn: '2026-10-17' };
    const contribution = txn({ type: 'transfer', amount: c(60), goalId: trip.id, date: '2026-10-17' });
    const s2 = safeToSpend(snapshot({ accounts: [account()], repeats: [paycheck], goals: [added], txns: [contribution] }), TODAY);
    expect(s2.goals).toBe(0);
  });

  it('lowers what is left today by today’s spending, without changing the allowance', () => {
    const acct = account({ balance: c(1200), checkedAt: 0, checkedOn: '2026-10-19' });
    const coffee = txn({ amount: c(30), date: TODAY, createdAt: 5 });
    const s = safeToSpend(snapshot({ accounts: [acct], repeats: [paycheck], txns: [coffee] }), TODAY);
    expect(s.perDay).toBe(c(100));
    expect(s.leftToday).toBe(c(70));
  });

  it('reports "over" instead of failing when bills exceed money', () => {
    const rent = repeat({ name: 'Rent', amount: c(2000), anchor: '2026-01-25' });
    const s = safeToSpend(snapshot({ accounts: [account({ balance: c(500) })], repeats: [paycheck, rent] }), TODAY);
    expect(s.untilPayday).toBe(c(500 - 2000 - 200));
    expect(s.perDay).toBe(0);
    expect(s.status).toBe('over');
  });

  it('falls back to the calendar month when there is no paycheck', () => {
    const s = safeToSpend(snapshot({ accounts: [account()] }), TODAY);
    expect(s.paydayKnown).toBe(false);
    expect(s.nextPayday).toBe('2026-11-01');
    expect(s.daysLeft).toBe(12);
  });

  it('counts side income expected before payday', () => {
    const side = repeat({ name: 'Etsy payout', kind: 'income', amount: c(80), frequency: 'monthly', anchor: '2026-01-27' });
    const s = safeToSpend(snapshot({ accounts: [account()], repeats: [paycheck, side] }), TODAY);
    expect(s.incoming).toBe(c(80));
  });

  it('ignores non-spendable accounts such as savings', () => {
    const savings = account({ name: 'Savings', type: 'savings', balance: c(5000), spendable: false });
    const s = safeToSpend(snapshot({ accounts: [account(), savings], repeats: [paycheck] }), TODAY);
    expect(s.accounts).toBe(c(1000));
  });
});


describe('goal allocations track actual contributions', () => {
  it('keeps the unfilled part protected after a small contribution', () => {
    const trip = goal({ monthly: c(130), saved: c(1), lastAddedOn: TODAY });
    const contribution = txn({ type: 'transfer', goalId: trip.id, amount: c(1), date: TODAY });
    const s = safeToSpend(snapshot({ accounts: [account()], repeats: [paycheck], goals: [trip], txns: [contribution] }), TODAY);
    expect(s.goals).toBe(c(59));
  });

  it('does not change total available money when moving a partial allocation into a goal', () => {
    const trip = goal({ monthly: c(100) });
    const acct = account({ balance: c(1000), checkedAt: 0, checkedOn: '2026-10-01' });
    const before = safeToSpend(snapshot({ accounts: [acct], goals: [trip] }), TODAY);
    const contribution = txn({ type: 'transfer', goalId: trip.id, amount: c(1), date: TODAY, createdAt: 1 });
    const after = safeToSpend(snapshot({ accounts: [acct], goals: [{ ...trip, saved: c(1), lastAddedOn: TODAY }], txns: [contribution] }), TODAY);
    expect(after.accounts).toBe(c(999));
    expect(after.goals).toBe(c(99));
    expect(after.untilPayday).toBe(before.untilPayday);
  });

  it('does not count a contribution twice after reconciling the bank balance', () => {
    const trip = goal({ monthly: c(100), saved: c(25), lastAddedOn: TODAY });
    const contribution = txn({ type: 'transfer', goalId: trip.id, amount: c(25), date: TODAY, createdAt: 1 });
    const acct = account({ balance: c(975), checkedAt: 2, checkedOn: TODAY });
    const s = safeToSpend(snapshot({ accounts: [acct], goals: [trip], txns: [contribution] }), TODAY);
    expect(s.accounts).toBe(c(975));
    expect(s.goals).toBe(c(75));
    expect(s.untilPayday).toBe(c(700));
  });

  it('adds multiple contributions and subtracts money taken back this period', () => {
    const trip = goal({ monthly: c(130), saved: c(30), lastAddedOn: TODAY });
    const txns = [
      txn({ type: 'transfer', goalId: trip.id, amount: c(20), date: '2026-10-17' }),
      txn({ type: 'transfer', goalId: trip.id, amount: c(30), date: '2026-10-18' }),
      txn({ type: 'transfer', goalId: trip.id, amount: c(20), inbound: true, date: TODAY }),
    ];
    expect(safeToSpend(snapshot({ repeats: [paycheck], goals: [trip], txns }), TODAY).goals).toBe(c(30));
  });

  it('caps the remaining allocation at the outstanding goal target', () => {
    const trip = goal({ monthly: c(130), target: c(100), saved: c(90) });
    const contribution = txn({ type: 'transfer', goalId: trip.id, amount: c(5), date: TODAY });
    expect(safeToSpend(snapshot({ repeats: [paycheck], goals: [trip], txns: [contribution] }), TODAY).goals).toBe(c(10));
  });

  it('does not re-reserve withdrawals from savings contributed in an older period', () => {
    const trip = goal({ monthly: c(130), saved: c(100) });
    const withdrawal = txn({ type: 'transfer', goalId: trip.id, amount: c(200), inbound: true, date: TODAY });
    expect(safeToSpend(snapshot({ repeats: [paycheck], goals: [trip], txns: [withdrawal] }), TODAY).goals).toBe(c(60));
  });

  it('ignores deleted, older, future and unrelated transfers', () => {
    const trip = goal({ monthly: c(130) });
    const txns = [
      txn({ type: 'transfer', goalId: trip.id, amount: c(60), date: TODAY, deletedAt: 5 }),
      txn({ type: 'transfer', goalId: trip.id, amount: c(60), date: '2026-10-15' }),
      txn({ type: 'transfer', goalId: trip.id, amount: c(60), date: '2026-10-21' }),
      txn({ type: 'transfer', goalId: 'different-goal', amount: c(60), date: TODAY }),
    ];
    expect(safeToSpend(snapshot({ repeats: [paycheck], goals: [trip], txns }), TODAY).goals).toBe(c(60));
  });

  it('does not assume a last-added date means the full allocation was funded', () => {
    const trip = goal({ monthly: c(130), saved: c(10), lastAddedOn: TODAY });
    expect(safeToSpend(snapshot({ repeats: [paycheck], goals: [trip] }), TODAY).goals).toBe(c(60));
  });

  it('excludes complete, archived and deleted goals and zero allocations', () => {
    const trip = goal({ monthly: c(130), saved: c(60) });
    const txns = [txn({ type: 'transfer', goalId: trip.id, amount: c(60), date: TODAY })];
    const goals = [trip, goal({ archived: true }), goal({ deletedAt: 10 }), goal({ saved: c(1000), target: c(1000) })];
    expect(safeToSpend(snapshot({ repeats: [paycheck], goals, txns }), TODAY).goalItems).toEqual([]);
  });

  it('uses a fresh allocation when forecasting a future period', () => {
    const trip = goal({ monthly: c(130), saved: c(60), lastAddedOn: TODAY });
    const txns = [txn({ type: 'transfer', goalId: trip.id, amount: c(60), date: TODAY })];
    expect(goalSetAsides(snapshot({ goals: [trip], txns }), undefined, 'biweekly')).toEqual([{ goalId: trip.id, name: trip.name, amount: c(60) }]);
  });
});
