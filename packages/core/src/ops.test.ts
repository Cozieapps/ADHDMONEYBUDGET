import { describe, expect, it } from 'vitest';
import { currentBalance } from './balances';
import { addToGoal, autopayDue, markRepeatPaid, payDebt, takeFromGoal, unmarkRepeatPaid } from './ops';
import { account, c, debt, goal, repeat, snapshot } from './test-fixtures';

describe('record operations', () => {
  it('ticking a bill logs it and lowers the balance', () => {
    const acct = account({ balance: c(1000), checkedAt: 0, checkedOn: '2026-10-01' });
    const rent = repeat({ name: 'Rent', amount: c(500), anchor: '2026-01-25', categoryId: 'cat-spend-home' });
    const { repeat: paid, txn } = markRepeatPaid(rent, '2026-10-25', 'app', 10);
    expect(paid.paid).toEqual(['2026-10-25']);
    expect(txn).toMatchObject({ type: 'spend', amount: c(500), repeatId: rent.id, categoryId: 'cat-spend-home' });
    // Ticking the same bill on another device produces the same record, so sync can't double it.
    expect(markRepeatPaid(rent, '2026-10-25', 'claude', 99).txn.id).toBe(txn.id);
    expect(currentBalance(acct, [txn], acct.id)).toBe(c(500));
  });

  it('unticking removes the logged transaction', () => {
    const rent = repeat({ amount: c(500) });
    const { repeat: paid, txn } = markRepeatPaid(rent, '2026-10-01', 'app', 10);
    const s = snapshot({ repeats: [paid], txns: [txn] });
    const undone = unmarkRepeatPaid(s, paid, '2026-10-01', 20);
    expect(undone.repeat.paid).toEqual([]);
    expect(undone.txns[0]!.deletedAt).toBe(20);
  });

  it('finds autopay bills that have come due', () => {
    const gym = repeat({ name: 'Gym', autopay: true, anchor: '2026-01-15', paid: ['2026-09-15'] });
    expect(autopayDue(snapshot({ repeats: [gym] }), '2026-10-20').map((d) => d.date)).toEqual(['2026-10-15']);
  });

  it('goal money leaves checking and can come back', () => {
    const acct = account({ balance: c(1000), checkedAt: 0, checkedOn: '2026-10-01' });
    const trip = goal({ saved: c(100) });
    const added = addToGoal(trip, c(50), '2026-10-20', 'app', 5);
    expect(added.goal.saved).toBe(c(150));
    expect(added.goal.lastAddedOn).toBe('2026-10-20');
    const taken = takeFromGoal(added.goal, c(500), '2026-10-21', 'app', 6);
    expect(taken.goal.saved).toBe(0);
    expect(currentBalance(acct, [added.txn, taken.txn], acct.id)).toBe(c(1100));
  });

  it('never creates money when withdrawing from an empty goal', () => {
    expect(() => takeFromGoal(goal({ saved: c(0) }), c(50), '2026-10-20')).toThrow();
  });

  it('rejects zero or negative goal withdrawals', () => {
    const trip = goal({ saved: c(100) });
    expect(() => takeFromGoal(trip, c(0), '2026-10-20')).toThrow();
    expect(() => takeFromGoal(trip, c(-10), '2026-10-20')).toThrow();
  });

  it('a debt payment lowers the debt and ticks the month', () => {
    const card = debt({ balance: c(300), minimum: c(50) });
    const { debt: after, txn } = payDebt(card, c(80), '2026-10-25');
    expect(after.balance).toBe(c(220));
    expect(after.paidMonths).toEqual(['2026-10']);
    expect(txn.debtId).toBe(card.id);
  });
});
