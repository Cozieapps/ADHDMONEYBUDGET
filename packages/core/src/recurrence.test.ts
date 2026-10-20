import { describe, expect, it } from 'vitest';
import { monthlyEquivalent, nextOccurrence, occurrences, previousOccurrence } from './recurrence';
import type { Repeat } from './types';

function repeat(partial: Partial<Repeat>): Repeat {
  return {
    id: 'r',
    updatedAt: 0,
    source: 'app',
    name: 'Test',
    kind: 'bill',
    amount: 1000 as Repeat['amount'],
    frequency: 'monthly',
    anchor: '2026-01-31',
    autopay: false,
    remindDaysBefore: 2,
    paid: [],
    active: true,
    ...partial,
  };
}

describe('occurrences', () => {
  it('keeps a month-end bill on the last day of short months', () => {
    expect(occurrences(repeat({}), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('steps biweekly from the anchor, even when the range starts mid-cycle', () => {
    const pay = repeat({ frequency: 'biweekly', anchor: '2026-10-02' });
    expect(occurrences(pay, '2026-10-20', '2026-11-30')).toEqual(['2026-10-30', '2026-11-13', '2026-11-27']);
  });

  it('handles semimonthly paydays on the 15th and last day', () => {
    const pay = repeat({ frequency: 'semimonthly', anchor: '2026-02-01', days: [15, 31] });
    expect(occurrences(pay, '2026-02-01', '2026-03-20')).toEqual(['2026-02-15', '2026-02-28', '2026-03-15']);
  });

  it('never generates dates before the anchor or after the end', () => {
    const r = repeat({ frequency: 'weekly', anchor: '2026-10-21', endsOn: '2026-11-04' });
    expect(occurrences(r, '2026-10-01', '2026-12-31')).toEqual(['2026-10-21', '2026-10-28', '2026-11-04']);
  });

  it('repeats yearly on the anchor date, clamping Feb 29', () => {
    const r = repeat({ frequency: 'yearly', anchor: '2028-02-29' });
    expect(occurrences(r, '2028-01-01', '2030-12-31')).toEqual(['2028-02-29', '2029-02-28', '2030-02-28']);
  });

  it('returns nothing for paused repeats', () => {
    expect(occurrences(repeat({ active: false }), '2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('finds the next and previous occurrence', () => {
    const pay = repeat({ frequency: 'biweekly', anchor: '2026-10-02' });
    expect(nextOccurrence(pay, '2026-10-16')).toBe('2026-10-30');
    expect(previousOccurrence(pay, '2026-10-20')).toBe('2026-10-16');
  });

  it('converts to a monthly average', () => {
    expect(monthlyEquivalent(100000, 'biweekly')).toBe(216667);
    expect(monthlyEquivalent(1200, 'yearly')).toBe(100);
  });
});
