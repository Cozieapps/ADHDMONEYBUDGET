import type { RecordKind, RecordMeta } from './types';

/** Real calendar dates at network/import boundaries; a regex alone accepts Feb 31. */
export function isISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const text = (v: unknown, max = 4_000): v is string => typeof v === 'string' && v.length <= max;
const nonempty = (v: unknown, max = 120): v is string => text(v, max) && v.length > 0;
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const money = (v: unknown, min = 0): v is number => integer(v, min, 1_000_000_000_000);
const bool = (v: unknown): v is boolean => typeof v === 'boolean';
const oneOf = (v: unknown, options: readonly string[]): boolean => typeof v === 'string' && options.includes(v);
const array = (v: unknown, check: (item: unknown) => boolean, max = 10_000): boolean => Array.isArray(v) && v.length <= max && v.every(check);
const optional = (v: unknown, check: (item: unknown) => boolean): boolean => v === undefined || check(v);
const id = (v: unknown): boolean => nonempty(v, 100);
const time = (v: unknown): boolean => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const month = (v: unknown): boolean => typeof v === 'string' && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(v);
const tone = (v: unknown): boolean => oneOf(v, ['pink', 'lavender', 'mint', 'peach', 'butter', 'sky']);

function settings(v: Record<string, unknown>): boolean {
  if (v.id !== 'settings' || !text(v.name, 120) || !text(v.currency, 3) || !/^[A-Z]{3}$/.test(v.currency) || !nonempty(v.locale, 80)) return false;
  try {
    Intl.getCanonicalLocales(v.locale);
    if (v.timeZone !== undefined) {
      if (!nonempty(v.timeZone, 100)) return false;
      new Intl.DateTimeFormat('en', { timeZone: v.timeZone });
    }
  } catch { return false; }
  const r = v.reminders;
  if (!object(r) || !['bills', 'payday', 'checkIn', 'pace', 'waitList'].every((k) => bool(r[k])) || ![r.checkInTime, r.quietStart, r.quietEnd].every(time)) return false;
  if (!money(v.buffer) || !bool(v.setupDone) || !integer(v.setupStep, 0, 100) || !bool(v.sounds) || !bool(v.haptics) || !bool(v.dailyLine)) return false;
  if (!oneOf(v.debtStrategy, ['snowball', 'avalanche', 'custom']) || !money(v.debtExtra) || !array(v.debtOrder, id, 1_000) || !optional(v.demo, bool)) return false;
  return optional(v.challenge52, (c) => object(c) && isISODate(c.startedOn) && bool(c.reverse) && array(c.done, (n) => integer(n, 1, 52), 52));
}

/**
 * Validate persisted/network records before they reach arithmetic or the UI.
 * Unknown additive fields are retained for forward compatibility. Tombstones may
 * omit domain fields because they never enter a live Snapshot.
 */
export function isValidRecord(kind: RecordKind, value: unknown): value is RecordMeta {
  if (!object(value) || !id(value.id) || !integer(value.updatedAt) || !oneOf(value.source, ['app', 'claude']) || !(value.deletedAt == null || integer(value.deletedAt))) return false;
  if (value.deletedAt != null) return true;
  const v = value;
  switch (kind) {
    case 'settings': return settings(v);
    case 'account': return nonempty(v.name) && oneOf(v.type, ['checking', 'savings', 'cash', 'credit']) && money(v.balance, -1_000_000_000_000) && integer(v.checkedAt) && isISODate(v.checkedOn) && bool(v.spendable);
    case 'category': return nonempty(v.name) && text(v.emoji, 32) && tone(v.tone) && oneOf(v.kind, ['spend', 'income']) && array(v.keywords, (k) => text(k, 120), 100) && integer(v.order, 0, 100_000);
    case 'txn': return isISODate(v.date) && money(v.amount, 1) && oneOf(v.type, ['spend', 'income', 'refund', 'transfer']) && integer(v.createdAt) && array(v.tags, (t) => text(t, 80), 100)
      && ['categoryId', 'accountId', 'repeatId', 'goalId', 'debtId'].every((k) => optional(v[k], id)) && optional(v.merchant, (x) => text(x, 500)) && optional(v.note, (x) => text(x)) && optional(v.inbound, bool);
    case 'repeat': return nonempty(v.name) && oneOf(v.kind, ['income', 'bill', 'subscription', 'debt', 'saving']) && money(v.amount, 1) && oneOf(v.frequency, ['weekly', 'biweekly', 'semimonthly', 'monthly', 'yearly']) && isISODate(v.anchor)
      && optional(v.days, (d) => Array.isArray(d) && d.length === 2 && d.every((n) => integer(n, 1, 31))) && optional(v.endsOn, isISODate) && optional(v.categoryId, id) && optional(v.accountId, id) && optional(v.isPaycheck, bool)
      && bool(v.autopay) && integer(v.remindDaysBefore, 0, 366) && array(v.paid, isISODate) && bool(v.active);
    case 'budget': return id(v.categoryId) && money(v.monthly);
    case 'goal': return nonempty(v.name) && text(v.emoji, 32) && tone(v.tone) && oneOf(v.kind, ['goal', 'emergency']) && money(v.target, 1) && money(v.saved) && money(v.monthly) && optional(v.targetDate, isISODate) && optional(v.lastAddedOn, isISODate) && optional(v.archived, bool);
    case 'debt': return nonempty(v.name) && money(v.balance) && typeof v.apr === 'number' && Number.isFinite(v.apr) && v.apr >= 0 && v.apr <= 1_000 && money(v.minimum) && integer(v.dueDay, 1, 31) && array(v.paidMonths, month);
    case 'wait': return nonempty(v.name) && money(v.amount, 1) && integer(v.addedAt) && integer(v.decideAfter) && oneOf(v.status, ['waiting', 'bought', 'skipped']) && optional(v.link, (x) => text(x, 2_000)) && optional(v.decidedAt, (x) => integer(x));
    case 'win': return isISODate(v.date) && [v.nothingToLog, v.checkedBalance, v.tickedBills].every((x) => optional(x, bool));
  }
}
