import { addDays, daysBetween } from './dates';
import { type Cents, formatCents } from './money';
import { nudges } from './patterns';
import { scheduleBetween } from './schedule';
import type { ISODate, ReminderPrefs, Snapshot } from './types';
import { winsFor } from './wins';

export interface PlannedReminder {
  /** Stable positive int so re-planning replaces instead of duplicating. */
  id: number;
  at: number;
  title: string;
  body: string;
  /** In-app route opened when the notification is tapped. */
  route: string;
  kind: 'bill' | 'payday' | 'check-in' | 'wait' | 'watch';
}

function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 1) || 1;
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function at(date: ISODate, hhmm: string): number {
  return new Date(`${date}T${hhmm}:00`).getTime();
}

/** Moves a time out of quiet hours to when they end. */
export function respectQuietHours(time: number, prefs: Pick<ReminderPrefs, 'quietStart' | 'quietEnd'>): number {
  const d = new Date(time);
  const now = d.getHours() * 60 + d.getMinutes();
  const start = minutes(prefs.quietStart);
  const end = minutes(prefs.quietEnd);
  const quiet = start > end ? now >= start || now < end : now >= start && now < end;
  if (!quiet) return time;
  const target = new Date(d);
  target.setHours(Math.floor(end / 60), end % 60, 0, 0);
  if (target.getTime() <= time) target.setDate(target.getDate() + 1);
  return target.getTime();
}

/** Everything Sori should remind the owner about in the coming days. Pure: the platform schedules it. */
export function planReminders(snapshot: Snapshot, today: ISODate, now = Date.now(), days = 14): PlannedReminder[] {
  const prefs = snapshot.settings.reminders;
  const money = (c: number) => formatCents(c as Cents, snapshot.settings.currency, snapshot.settings.locale);
  const out: PlannedReminder[] = [];
  const push = (r: Omit<PlannedReminder, 'id' | 'at'> & { at: number; key: string }) => {
    const time = respectQuietHours(r.at, prefs);
    if (time <= now) return;
    out.push({ id: hash(r.key), at: time, title: r.title, body: r.body, route: r.route, kind: r.kind });
  };
  if (!snapshot.settings.setupDone) return out;

  const items = scheduleBetween(snapshot, today, addDays(today, days + 7));
  for (const item of items) {
    if (item.paid) continue;
    const repeat = snapshot.repeats.find((r) => r.id === item.refId);
    if (item.isIncome) {
      if (!prefs.payday || !repeat?.isPaycheck) continue;
      push({ key: `payday:${item.key}`, at: at(item.date, '09:00'), kind: 'payday', title: 'Payday! 🎉', body: `Did your ${money(item.amount)} arrive? Mark it and give the money a job.`, route: '/calendar' });
      continue;
    }
    if (!prefs.bills || item.autopay) continue;
    const lead = repeat?.remindDaysBefore ?? 2;
    const remindOn = addDays(item.date, -lead);
    const label = lead === 0 ? 'is due today' : lead === 1 ? 'is due tomorrow' : `is due in ${lead} days`;
    push({ key: `bill:${item.key}:${lead}`, at: at(remindOn, '09:00'), kind: 'bill', title: `${item.name} ${label}`, body: `${money(item.amount)} — tick it off in Sori once it’s paid.`, route: '/calendar' });
    if (lead > 0) {
      push({ key: `bill:${item.key}:0`, at: at(item.date, '09:00'), kind: 'bill', title: `${item.name} is due today`, body: `${money(item.amount)}. Already paid? Tick it off so your number stays right.`, route: '/calendar' });
    }
  }

  if (prefs.checkIn) {
    for (let i = 0; i < days; i++) {
      const date = addDays(today, i);
      if (i === 0 && winsFor(snapshot, today).logged) continue;
      push({ key: `checkin:${date}`, at: at(date, prefs.checkInTime), kind: 'check-in', title: 'Quick check-in? 🌱', body: 'Log today’s spending — or tap “Nothing today”. Thirty seconds, then you’re done.', route: '/log' });
    }
  }

  if (prefs.waitList) {
    for (const w of snapshot.waits) {
      if (w.deletedAt || w.status !== 'waiting') continue;
      push({ key: `wait:${w.id}`, at: Math.max(w.decideAfter, now + 60_000), kind: 'wait', title: `Still want the ${w.name}?`, body: `Your 48 hours are up. Buy it with a clear head, or skip it and count ${money(w.amount)} as saved.`, route: '/goals?tab=wait' });
    }
  }

  if (prefs.pace) {
    const important = nudges(snapshot, today, now).filter((n) => ['over', 'forecast'].includes(n.icon) || n.id.startsWith('pace:'));
    const first = important[0];
    if (first) {
      const middayToday = at(today, '12:30');
      const when = middayToday > now ? middayToday : at(addDays(today, 1), '12:30');
      push({ key: `watch:${first.id}:${today}`, at: when, kind: 'watch', title: first.title, body: first.body, route: first.action?.to.startsWith('/') ? first.action.to : '/' });
    }
  }

  return out.sort((a, b) => a.at - b.at).slice(0, 60);
}

export function reminderLabel(reminder: PlannedReminder, today: ISODate): string {
  const d = new Date(reminder.at);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const diff = daysBetween(today, date);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return diff === 0 ? `Today ${time}` : diff === 1 ? `Tomorrow ${time}` : `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
}
