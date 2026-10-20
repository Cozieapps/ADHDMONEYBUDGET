import { addDays, daysBetween } from './dates';
import { payPeriod, scheduleBetween } from './schedule';
import type { ISODate, Snapshot } from './types';

export interface DayWins {
  date: ISODate;
  checkedBalance: boolean;
  tickedBills: boolean;
  logged: boolean;
  nothingToLog: boolean;
  count: number;
}

/** The three daily Small wins. Bills count as done when nothing is waiting to be ticked. */
export function winsFor(snapshot: Snapshot, date: ISODate): DayWins {
  const record = snapshot.wins.find((w) => !w.deletedAt && w.date === date);
  const checkedBalance = Boolean(record?.checkedBalance) || snapshot.accounts.some((a) => !a.deletedAt && a.checkedOn === date);
  const period = payPeriod(snapshot, date);
  const waiting = scheduleBetween(snapshot, period.start, date).some((i) => !i.isIncome && !i.paid && !i.autopay);
  const tickedBills = Boolean(record?.tickedBills) || !waiting;
  const nothingToLog = Boolean(record?.nothingToLog);
  const logged = nothingToLog || snapshot.txns.some((t) => !t.deletedAt && t.date === date && t.type !== 'transfer');
  return { date, checkedBalance, tickedBills, logged, nothingToLog, count: [checkedBalance, tickedBills, logged].filter(Boolean).length };
}

function showedUp(snapshot: Snapshot, date: ISODate): boolean {
  const w = winsFor(snapshot, date);
  return w.logged || w.checkedBalance;
}

/**
 * Days in a row you showed up (logged something, said "nothing today", or checked a balance).
 * Forgiving: one missed day per week doesn't break it, and today doesn't count against you until it's over.
 */
export function streak(snapshot: Snapshot, today: ISODate): { days: number; usedFreePass: boolean } {
  let days = 0;
  let lastMiss: number | undefined;
  let usedFreePass = false;
  let date = showedUp(snapshot, today) ? today : addDays(today, -1);
  for (let i = 0; i < 366; i++, date = addDays(date, -1)) {
    if (showedUp(snapshot, date)) {
      days += 1;
      continue;
    }
    const gap = lastMiss === undefined ? Infinity : lastMiss - i;
    if (days > 0 && (lastMiss === undefined || Math.abs(gap) >= 7) && daysBetween(date, today) > 0) {
      lastMiss = i;
      usedFreePass = true;
      continue;
    }
    break;
  }
  return { days, usedFreePass };
}
