import { lastCheckedAt } from './balances';
import { addDays, daysBetween, dayNumber, endOfMonth, startOfMonth, today as todayOf } from './dates';
import { forecast } from './forecast';
import { progress } from './goals';
import { type Cents, formatCents } from './money';
import { safeToSpend } from './safe-to-spend';
import { scheduleBetween } from './schedule';
import { discretionary, liveTxns, netSpend, spendByWeekday } from './spending';
import type { ISODate, Snapshot, Tone } from './types';

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function label(t: { merchant?: string; note?: string }): string {
  return (t.merchant || t.note || '').trim();
}

export interface Usual {
  label: string;
  amount: Cents;
  categoryId?: string;
  count: number;
}

/** Purchases you make again and again, offered as one-tap buttons. */
export function usuals(snapshot: Snapshot, today: ISODate, limit = 4): Usual[] {
  const groups = new Map<string, Usual & { last: ISODate }>();
  for (const t of liveTxns(snapshot)) {
    if (t.type !== 'spend' || t.repeatId || t.date < addDays(today, -60)) continue;
    const name = (t.note || t.merchant || '').trim();
    if (!name) continue;
    const key = `${name.toLowerCase()}|${t.amount}`;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      if (t.date > g.last) g.last = t.date;
    } else {
      groups.set(key, { label: name, amount: t.amount, count: 1, last: t.date, ...(t.categoryId ? { categoryId: t.categoryId } : {}) });
    }
  }
  const seen = new Set<string>();
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))
    .filter((g) => !seen.has(g.label.toLowerCase()) && seen.add(g.label.toLowerCase()))
    .slice(0, limit)
    .map(({ last: _last, ...u }) => u);
}

export interface DetectedSubscription {
  name: string;
  amount: Cents;
  lastDate: ISODate;
  categoryId?: string;
}

/** Same name, about a month apart, similar amount — and not already a repeat. */
export function detectSubscriptions(snapshot: Snapshot, today: ISODate): DetectedSubscription[] {
  const byName = new Map<string, { date: ISODate; amount: number; categoryId?: string; name: string }[]>();
  for (const t of liveTxns(snapshot)) {
    if (t.type !== 'spend' || t.repeatId || t.date < addDays(today, -120)) continue;
    const name = label(t);
    if (!name) continue;
    const list = byName.get(name.toLowerCase()) ?? [];
    list.push({ date: t.date, amount: t.amount, name, ...(t.categoryId ? { categoryId: t.categoryId } : {}) });
    byName.set(name.toLowerCase(), list);
  }
  const known = snapshot.repeats.filter((r) => !r.deletedAt).map((r) => r.name.toLowerCase());
  const out: DetectedSubscription[] = [];
  for (const [key, list] of byName) {
    if (list.length < 2 || known.some((k) => k.includes(key) || key.includes(k))) continue;
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    const gaps = list.slice(1).map((x, i) => daysBetween(list[i]!.date, x.date));
    const monthly = gaps.every((g) => g >= 26 && g <= 35);
    const steady = list.every((x) => Math.abs(x.amount - list[0]!.amount) <= list[0]!.amount * 0.1);
    if (monthly && steady) {
      const last = list[list.length - 1]!;
      out.push({ name: last.name, amount: last.amount as Cents, lastDate: last.date, ...(last.categoryId ? { categoryId: last.categoryId } : {}) });
    }
  }
  return out;
}

export type NudgeIcon = 'balance' | 'bill' | 'over' | 'forecast' | 'pace' | 'subscription' | 'small-buys' | 'wait' | 'payday' | 'goal';

export interface Nudge {
  id: string;
  icon: NudgeIcon;
  tone: Tone;
  title: string;
  body: string;
  /** A route (`/forecast`) or an in-app dialog (`dialog:balance`). */
  action?: { label: string; to: string };
  /** A ready-made question for Claude about this nudge. */
  claudePrompt: string;
  priority: number;
}

/** Gentle, specific suggestions — the in-app "wallet watch". Never shaming. */
export function nudges(snapshot: Snapshot, today: ISODate, now = Date.now()): Nudge[] {
  const money = (c: number) => formatCents(c as Cents, snapshot.settings.currency, snapshot.settings.locale);
  const list: Nudge[] = [];
  const sts = safeToSpend(snapshot, today);

  const checked = lastCheckedAt(snapshot.accounts);
  if (snapshot.accounts.length && (checked === undefined || daysBetween(todayOf(new Date(checked)), today) >= 3)) {
    const days = checked === undefined ? undefined : daysBetween(todayOf(new Date(checked)), today);
    list.push({
      id: 'balance',
      icon: 'balance',
      tone: 'sky',
      title: 'Quick balance check?',
      body: days ? `Last checked ${days} days ago. Twenty seconds keeps your number honest.` : 'Twenty seconds keeps your number honest.',
      action: { label: 'Check balances', to: 'dialog:balance' },
      claudePrompt: 'Use Sori to walk me through a quick balance check.',
      priority: 70,
    });
  }

  if (sts.status === 'over') {
    list.push({
      id: 'over',
      icon: 'over',
      tone: 'peach',
      title: 'Bills before payday are bigger than what’s here',
      body: `Short by about ${money(-sts.untilPayday)}. Pausing goal money or lowering the buffer for now can bridge it.`,
      action: { label: 'See the forecast', to: '/forecast' },
      claudePrompt: 'Use Sori: my bills before payday are more than what I have. Help me make a calm plan to bridge the gap.',
      priority: 100,
    });
  }

  for (const item of scheduleBetween(snapshot, addDays(today, -3), addDays(today, 1))) {
    if (item.isIncome || item.paid || item.autopay) continue;
    const when = item.date < today ? 'was due' : item.date === today ? 'is due today' : 'is due tomorrow';
    list.push({
      id: `bill:${item.key}`,
      icon: 'bill',
      tone: 'butter',
      title: `${item.name} ${when}`,
      body: `${money(item.amount)}. Tick it off once it’s paid and Sori updates your number.`,
      action: { label: 'Open calendar', to: '/calendar' },
      claudePrompt: `Use Sori: ${item.name} (${money(item.amount)}) ${when}. Can I cover it comfortably?`,
      priority: item.date <= today ? 92 : 88,
    });
  }

  for (const item of scheduleBetween(snapshot, today, today)) {
    const repeat = snapshot.repeats.find((r) => r.id === item.refId);
    if (!item.isIncome || item.paid || !repeat?.isPaycheck) continue;
    list.push({
      id: `payday:${item.key}`,
      icon: 'payday',
      tone: 'mint',
      title: 'Payday! 🎉',
      body: `Did your ${money(item.amount)} arrive? Mark it and give the money a job.`,
      action: { label: 'Mark it arrived', to: '/calendar' },
      claudePrompt: 'Use Sori to help me plan this paycheck: bills, goals and fun money.',
      priority: 95,
    });
  }

  const f = forecast(snapshot, today, 30);
  // Without known income the forecast only shows money going out, so don't alarm.
  if (f.firstDayBelowProtected && sts.status !== 'over' && sts.paydayKnown) {
    list.push({
      id: 'forecast',
      icon: 'forecast',
      tone: 'peach',
      title: `Heads-up for ${new Date(`${f.lowest.date}T12:00:00`).toLocaleDateString(snapshot.settings.locale, { month: 'short', day: 'numeric' })}`,
      body: `At your usual pace, your balance may dip to about ${money(f.lowest.balance)} — below your ${money(snapshot.settings.buffer)} buffer.`,
      action: { label: 'Open forecast', to: '/forecast' },
      claudePrompt: 'Use Sori: my forecast dips below my buffer this month. What are gentle ways to avoid that?',
      priority: 85,
    });
  }

  const monthStart = startOfMonth(today);
  const elapsed = (daysBetween(monthStart, today) + 1) / (daysBetween(monthStart, endOfMonth(today)) + 1);
  const monthTxns = liveTxns(snapshot).filter((t) => t.date >= monthStart && t.date <= today);
  for (const b of snapshot.budgets) {
    if (b.deletedAt || b.monthly <= 0) continue;
    const spent = netSpend(monthTxns.filter((t) => t.categoryId === b.categoryId));
    if (spent > 2000 && spent > b.monthly * elapsed * 1.15) {
      const cat = snapshot.categories.find((c) => c.id === b.categoryId);
      const daysLeft = daysBetween(today, endOfMonth(today));
      list.push({
        id: `pace:${b.categoryId}`,
        icon: 'pace',
        tone: 'butter',
        title: `${cat?.name ?? 'A category'} is ahead of pace`,
        body: `${money(spent)} of ${money(b.monthly)} with ${daysLeft} days to go. You can move money from another envelope.`,
        action: { label: 'Re-plan', to: '/spending' },
        claudePrompt: `Use Sori: ${cat?.name ?? 'one category'} is ahead of pace this month. Help me re-plan without guilt.`,
        priority: 60,
      });
    }
  }

  const smallBuys = liveTxns(snapshot).filter((t) => t.type === 'spend' && !t.repeatId && t.amount < 1500 && t.date > addDays(today, -7));
  const smallTotal = smallBuys.reduce((s, t) => s + t.amount, 0);
  if (smallBuys.length >= 5 && smallTotal >= 4000) {
    list.push({
      id: 'small-buys',
      icon: 'small-buys',
      tone: 'lavender',
      title: `Little buys added up to ${money(smallTotal)} this week`,
      body: 'Not a problem — just worth seeing. The 48-hour wait list can catch the next one.',
      action: { label: 'Open wait list', to: '/goals?tab=wait' },
      claudePrompt: 'Use Sori: look at my small purchases this week and help me notice any patterns, kindly.',
      priority: 40,
    });
  }

  for (const sub of detectSubscriptions(snapshot, today).slice(0, 1)) {
    list.push({
      id: `sub:${sub.name}`,
      icon: 'subscription',
      tone: 'lavender',
      title: `Looks like a subscription: ${sub.name}`,
      body: `${money(sub.amount)} about once a month. Add it to Repeats so it’s planned for.`,
      action: { label: 'Add to Repeats', to: '/spending?tab=repeats' },
      claudePrompt: `Use Sori: is ${sub.name} worth keeping? Help me review my subscriptions.`,
      priority: 35,
    });
  }

  for (const w of snapshot.waits) {
    if (w.deletedAt || w.status !== 'waiting' || w.decideAfter > now) continue;
    list.push({
      id: `wait:${w.id}`,
      icon: 'wait',
      tone: 'pink',
      title: `Still want the ${w.name}?`,
      body: `Your 48 hours are up. Buy it with a clear head, or skip it and count it as saved.`,
      action: { label: 'Decide', to: '/goals?tab=wait' },
      claudePrompt: `Use Sori: I've waited 48 hours on ${w.name} (${money(w.amount)}). Help me decide.`,
      priority: 75,
    });
  }

  for (const g of snapshot.goals) {
    if (g.deletedAt || g.archived) continue;
    const p = progress(g);
    if (p >= 1) {
      list.push({
        id: `goal:${g.id}:done`,
        icon: 'goal',
        tone: 'mint',
        title: `${g.name} is full! ${g.emoji}`,
        body: 'You did that. Celebrate it, then decide what this money gets to do.',
        action: { label: 'See goals', to: '/goals' },
        claudePrompt: `Use Sori: I reached my ${g.name} goal! What's a good next goal?`,
        priority: 50,
      });
    }
  }

  return list.sort((a, b) => b.priority - a.priority);
}

export interface Pattern {
  id: string;
  tone: Tone;
  title: string;
  body: string;
}

/** Observations for Insights: what Sori noticed, phrased without judgement. */
export function patternsFound(snapshot: Snapshot, today: ISODate): Pattern[] {
  const money = (c: number) => formatCents(c as Cents, snapshot.settings.currency, snapshot.settings.locale);
  const out: Pattern[] = [];
  const byDay = spendByWeekday(snapshot, today);
  const max = Math.max(...byDay);
  const peak = byDay.indexOf(max);
  const others = byDay.filter((_, i) => i !== peak);
  const mean = others.reduce((s, v) => s + v, 0) / Math.max(1, others.length);
  if (max > 1500 && max >= mean * 1.6) {
    out.push({
      id: 'weekday',
      tone: 'sky',
      title: `${WEEKDAYS[peak]} are your big spending day`,
      body: `About ${money(max)} on a typical ${WEEKDAYS[peak]!.slice(0, -1)}, versus ${money(Math.round(mean))} on other days. Planning for it beats fighting it.`,
    });
  }

  const recent = discretionary(liveTxns(snapshot).filter((t) => t.date > addDays(today, -30) && t.type === 'spend'));
  const evening = recent.filter((t) => {
    const h = new Date(t.createdAt).getHours();
    return h >= 21 || h < 3;
  });
  if (recent.length >= 8 && evening.length / recent.length >= 0.25) {
    out.push({
      id: 'evening',
      tone: 'lavender',
      title: 'Late evenings are when buys sneak in',
      body: `${evening.length} of your last ${recent.length} purchases were logged after 9pm (${money(netSpend(evening))}). Tired-brain shopping is real — the wait list helps.`,
    });
  }

  const thisMonth = netSpend(discretionary(liveTxns(snapshot).filter((t) => t.date >= startOfMonth(today) && t.date <= today)));
  const lastMonthStart = startOfMonth(addDays(startOfMonth(today), -1));
  const dayOfPeriod = dayNumber(today) - dayNumber(startOfMonth(today));
  const lastMonthSameDay = addDays(lastMonthStart, dayOfPeriod);
  const lastMonth = netSpend(discretionary(liveTxns(snapshot).filter((t) => t.date >= lastMonthStart && t.date <= lastMonthSameDay)));
  if (lastMonth > 0 && thisMonth > 0) {
    const change = (thisMonth - lastMonth) / lastMonth;
    if (Math.abs(change) >= 0.1) {
      out.push({
        id: 'month-change',
        tone: change < 0 ? 'mint' : 'peach',
        title: change < 0 ? `Everyday spending is ${Math.round(-change * 100)}% lower than last month` : `Everyday spending is ${Math.round(change * 100)}% higher than last month`,
        body: `${money(thisMonth)} so far, compared with ${money(lastMonth)} by this point last month.`,
      });
    }
  }
  return out;
}
