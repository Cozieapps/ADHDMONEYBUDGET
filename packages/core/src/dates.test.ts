import { describe, expect, it } from 'vitest';
import { addDays, addMonths, dateInMonth, daysBetween, endOfMonth, todayIn, weekday } from './dates';

describe('dates', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('is not affected by daylight-saving changes', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1);
  });

  it('clamps month days', () => {
    expect(dateInMonth(2026, 2, 31)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('knows month ends and weekdays', () => {
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(weekday('2026-10-20')).toBe(2); // Tuesday
    expect(weekday('1969-12-28')).toBe(0); // Sunday, before the epoch
  });
});

describe('todayIn', () => {
  it('uses the owner’s time zone, not the server’s', () => {
    const lateEveningInChicago = new Date('2026-10-21T03:30:00Z');
    expect(todayIn('America/Chicago', lateEveningInChicago)).toBe('2026-10-20');
    expect(todayIn('Asia/Tokyo', lateEveningInChicago)).toBe('2026-10-21');
  });
});
