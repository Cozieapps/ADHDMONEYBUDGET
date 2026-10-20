import type { ISODate } from './types';

// Dates are handled as day numbers (days since 1970-01-01) computed in UTC, so
// daylight-saving changes can never shift a bill to the wrong day.

const DAY_MS = 86_400_000;

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** Today's date in a given time zone (the server runs in UTC; the owner doesn't). */
export function todayIn(timeZone: string | undefined, now: Date = new Date()): ISODate {
  if (!timeZone) return toISODate(now);
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return toISODate(now);
  }
}

function parts(date: ISODate): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) throw new RangeError(`Invalid date: ${date}`);
  return [y, m, d];
}

export function dayNumber(date: ISODate): number {
  const [y, m, d] = parts(date);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n: number): ISODate {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(dayNumber(date) + days);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return dayNumber(b) - dayNumber(a);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The given day in a month, clamped to the month's length (31 → 30 in April). */
export function dateInMonth(year: number, month: number, day: number): ISODate {
  const d = Math.min(day, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addMonths(date: ISODate, months: number, day?: number): ISODate {
  const [y, m, d] = parts(date);
  const index = y * 12 + (m - 1) + months;
  return dateInMonth(Math.floor(index / 12), (index % 12) + 1, day ?? d);
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: ISODate): ISODate {
  const [y, m] = parts(date);
  return dateInMonth(y, m, 31);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: ISODate): number {
  return (((dayNumber(date) + 4) % 7) + 7) % 7;
}

export function dayOfMonth(date: ISODate): number {
  return parts(date)[2];
}

export function monthIndex(date: ISODate): { year: number; month: number } {
  const [year, month] = parts(date);
  return { year, month };
}

export function isBefore(a: ISODate, b: ISODate): boolean {
  return a < b;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}
