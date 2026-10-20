import { addDays, addMonths, dateInMonth, dayNumber, monthIndex } from './dates';
import type { Frequency, ISODate, Repeat } from './types';

export const PAY_PERIODS_PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  yearly: 1,
};

/** Converts a per-occurrence amount to an average per month. */
export function monthlyEquivalent(amount: number, frequency: Frequency): number {
  return Math.round((amount * PAY_PERIODS_PER_YEAR[frequency]) / 12);
}

/** All occurrence dates of a repeat within [from, to] (inclusive), in order. */
export function occurrences(
  repeat: Pick<Repeat, 'frequency' | 'anchor' | 'days' | 'endsOn' | 'active'>,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  if (!repeat.active || to < from) return [];
  const start = from > repeat.anchor ? from : repeat.anchor;
  const end = repeat.endsOn && repeat.endsOn < to ? repeat.endsOn : to;
  if (end < start) return [];

  const out: ISODate[] = [];
  const push = (date: ISODate) => {
    if (date >= start && date <= end && date >= repeat.anchor) out.push(date);
  };

  switch (repeat.frequency) {
    case 'weekly':
    case 'biweekly': {
      const step = repeat.frequency === 'weekly' ? 7 : 14;
      const offset = dayNumber(start) - dayNumber(repeat.anchor);
      let date = addDays(repeat.anchor, Math.max(0, Math.ceil(offset / step)) * step);
      while (date <= end) {
        push(date);
        date = addDays(date, step);
      }
      break;
    }
    case 'monthly':
    case 'yearly': {
      const step = repeat.frequency === 'monthly' ? 1 : 12;
      const anchorDay = Number(repeat.anchor.slice(8, 10));
      const a = monthIndex(repeat.anchor);
      const s = monthIndex(start);
      const monthsFromAnchor = (s.year - a.year) * 12 + (s.month - a.month);
      let k = Math.max(0, Math.floor(monthsFromAnchor / step) * step);
      for (;;) {
        const date = addMonths(repeat.anchor, k, anchorDay);
        if (date > end) break;
        push(date);
        k += step;
      }
      break;
    }
    case 'semimonthly': {
      const [d1, d2] = repeat.days ?? [Number(repeat.anchor.slice(8, 10)), 15];
      const days = [d1, d2].sort((x, y) => x - y);
      let { year, month } = monthIndex(start);
      for (;;) {
        const first = dateInMonth(year, month, 1);
        if (first > end) break;
        for (const day of days) push(dateInMonth(year, month, day));
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      break;
    }
  }
  return out;
}

/** The first occurrence strictly after `date`, looking up to a year ahead. */
export function nextOccurrence(repeat: Repeat, after: ISODate): ISODate | undefined {
  return occurrences(repeat, addDays(after, 1), addDays(after, 400))[0];
}

/** The most recent occurrence on or before `date`. */
export function previousOccurrence(repeat: Repeat, onOrBefore: ISODate): ISODate | undefined {
  const list = occurrences(repeat, addDays(onOrBefore, -400), onOrBefore);
  return list[list.length - 1];
}
