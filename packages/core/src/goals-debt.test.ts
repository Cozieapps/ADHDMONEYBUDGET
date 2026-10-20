import { describe, expect, it } from 'vitest';
import { minimumsOnly, payoffOrder, simulatePayoff } from './debt';
import { challengeAmount, etaDate, monthlyNeeded, monthsToGoal, safetyNet } from './goals';
import { c, debt, goal, repeat, snapshot } from './test-fixtures';

describe('goals', () => {
  it('estimates when a goal fills up', () => {
    const g = goal({ target: c(5000), saved: c(3100), monthly: c(250) });
    expect(monthsToGoal(g)).toBe(8);
    expect(etaDate(g, '2026-10-20')).toBe('2027-06-20');
    expect(monthsToGoal({ ...g, monthly: c(0) })).toBeUndefined();
  });

  it('works out the monthly amount for a target date', () => {
    const g = goal({ target: c(1200), saved: c(350), targetDate: '2027-05-20' });
    expect(monthlyNeeded(g, '2026-10-20')).toBe(c(121.43));
  });

  it('measures the safety net in months of usual costs', () => {
    const s = snapshot({
      goals: [goal({ kind: 'emergency', saved: c(3000) })],
      repeats: [repeat({ amount: c(1000) })],
    });
    expect(safetyNet(s, '2026-10-20').monthsCovered).toBeCloseTo(3);
  });

  it('runs the 52-week challenge both ways', () => {
    expect(challengeAmount(1, false)).toBe(c(1));
    expect(challengeAmount(1, true)).toBe(c(52));
  });
});

describe('debt payoff', () => {
  const card = debt({ id: 'card', name: 'Visa', balance: c(3900), apr: 24.99, minimum: c(95) });
  const car = debt({ id: 'car', name: 'Car', balance: c(1200), apr: 6.9, minimum: c(150) });

  it('orders by strategy', () => {
    expect(payoffOrder([card, car], 'snowball')).toEqual(['car', 'card']);
    expect(payoffOrder([card, car], 'avalanche')).toEqual(['card', 'car']);
    expect(payoffOrder([card, car], 'custom', ['car'])).toEqual(['car', 'card']);
  });

  it('pays off sooner and with less interest when adding extra', () => {
    const base = simulatePayoff([card, car], { strategy: 'avalanche', extra: c(0), start: '2026-10-20' });
    const extra = simulatePayoff([card, car], { strategy: 'avalanche', extra: c(150), start: '2026-10-20' });
    expect(extra.months).toBeLessThan(base.months);
    expect(extra.totalInterest).toBeLessThan(base.totalInterest);
    expect(extra.payoffDates.card).toBeDefined();
    expect(extra.series[0]!.balance).toBe(c(5100));
    expect(extra.series.at(-1)!.balance).toBe(0);
  });

  it('avalanche never costs more interest than snowball', () => {
    const a = simulatePayoff([card, car], { strategy: 'avalanche', extra: c(100), start: '2026-10-20' });
    const s = simulatePayoff([card, car], { strategy: 'snowball', extra: c(100), start: '2026-10-20' });
    expect(a.totalInterest).toBeLessThanOrEqual(s.totalInterest);
  });

  it('matches a known single-loan amortization', () => {
    // $1,000 at 12% APR, $100/month → 11 months, about $58 interest.
    const loan = debt({ balance: c(1000), apr: 12, minimum: c(100) });
    const r = simulatePayoff([loan], { strategy: 'avalanche', extra: c(0), start: '2026-01-01' });
    expect(r.months).toBe(11);
    expect(r.totalInterest).toBeGreaterThan(c(55));
    expect(r.totalInterest).toBeLessThan(c(60));
  });

  it('detects payments that never cover the interest', () => {
    const stuck = debt({ balance: c(10000), apr: 30, minimum: c(100) });
    expect(minimumsOnly([stuck], '2026-01-01').neverEnds).toBe(true);
  });
});
