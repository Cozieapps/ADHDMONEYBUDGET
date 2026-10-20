import { describe, expect, it } from 'vitest';
import { canIAfford, forecast } from './forecast';
import { account, c, goal, repeat, snapshot, txn } from './test-fixtures';

const TODAY = '2026-10-20';
const paycheck = repeat({ name: 'Paycheck', kind: 'income', isPaycheck: true, amount: c(2000), frequency: 'biweekly', anchor: '2026-10-02' });

describe('forecast', () => {
  it('walks the balance through bills and paydays', () => {
    const rent = repeat({ name: 'Rent', amount: c(1000), anchor: '2026-01-25' });
    const s = snapshot({ accounts: [account({ balance: c(1500) })], repeats: [paycheck, rent] });
    const f = forecast(s, TODAY, 15);
    // No history yet, so everyday spend falls back to the safe-to-spend allowance.
    expect(f.learnedDailySpend).toBe(false);
    const rentDay = f.days.find((d) => d.date === '2026-10-25')!;
    expect(rentDay.events.map((e) => e.name)).toContain('Rent');
    const payday = f.days.find((d) => d.date === '2026-10-30')!;
    expect(payday.events.some((e) => e.kind === 'income' && e.amount === c(2000))).toBe(true);
    expect(f.lowest.date < '2026-10-30').toBe(true);
  });

  it('learns everyday spending from a week or more of history', () => {
    const history = Array.from({ length: 14 }, (_, i) =>
      txn({ date: `2026-10-${String(6 + i).padStart(2, '0')}`, amount: c(20), createdAt: 0 }),
    );
    const f = forecast(snapshot({ accounts: [account({ balance: c(1000) })], txns: history }), TODAY, 10);
    expect(f.learnedDailySpend).toBe(true);
    expect(f.dailySpend).toBe(c(20));
  });

  it('flags the first day the balance would drop below the buffer', () => {
    const rent = repeat({ name: 'Rent', amount: c(1000), anchor: '2026-01-25' });
    const f = forecast(snapshot({ accounts: [account({ balance: c(1100) })], repeats: [paycheck, rent] }), TODAY, 10);
    expect(f.firstDayBelowProtected).toBe('2026-10-25');
  });
});

describe('canIAfford', () => {
  const s = snapshot({ accounts: [account({ balance: c(1200) })], repeats: [paycheck] });

  it('says yes when it fits in today’s amount', () => {
    expect(canIAfford(s, TODAY, c(50)).verdict).toBe('yes');
  });

  it('calls it a stretch when it fits before payday but not today', () => {
    const a = canIAfford(s, TODAY, c(300));
    expect(a.verdict).toBe('stretch');
    expect(a.perDayAfter).toBe(c(70));
  });

  it('says not now when it would break the safety buffer', () => {
    const a = canIAfford(s, TODAY, c(1500));
    expect(a.verdict).toBe('not-now');
    expect(a.shortBy).toBeGreaterThan(0);
  });
});


it('continues future goal allocations after a contribution in the current period', () => {
  const trip = goal({ monthly: c(130), saved: c(60), lastAddedOn: TODAY });
  const contribution = txn({ type: 'transfer', goalId: trip.id, amount: c(60), date: TODAY });
  const s = snapshot({ accounts: [account()], repeats: [paycheck], goals: [trip], txns: [contribution] });
  const f = forecast(s, TODAY, 15);
  expect(f.days[0]!.events.filter(e => e.kind === 'goal')).toEqual([]);
  expect(f.days.find(d => d.date === '2026-10-30')!.events).toContainEqual({ name: trip.name, amount: c(-60), kind: 'goal' });
});


it('stops reserving a nearly complete goal after today fills its target', () => {
  const trip = goal({ monthly: c(130), saved: c(90), target: c(100) });
  const s = snapshot({ accounts: [account()], repeats: [paycheck], goals: [trip] });
  const events = forecast(s, TODAY, 40).days.flatMap(d => d.events).filter(e => e.kind === 'goal');
  expect(events).toEqual([{ name: trip.name, amount: c(-10), kind: 'goal' }]);
});

it('caps all future goal reservations at the amount still needed for the target', () => {
  const trip = goal({ monthly: c(130), saved: c(50), target: c(100), lastAddedOn: TODAY });
  const contribution = txn({ type: 'transfer', goalId: trip.id, amount: c(20), date: TODAY });
  const s = snapshot({ accounts: [account()], repeats: [paycheck], goals: [trip], txns: [contribution] });
  const events = forecast(s, TODAY, 40).days.flatMap(d => d.events).filter(e => e.kind === 'goal');
  expect(events.map(e => e.amount)).toEqual([c(-40), c(-10)]);
});
