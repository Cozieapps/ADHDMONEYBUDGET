import { describe, expect, it } from 'vitest';
import { dailyLine } from './lines';
import { detectSubscriptions, nudges, usuals } from './patterns';
import { account, c, repeat, snapshot, txn } from './test-fixtures';
import { streak, winsFor } from './wins';

const TODAY = '2026-10-20';
const now = new Date('2026-10-20T12:00:00').getTime();

describe('usuals', () => {
  it('offers repeated purchases as one-tap buttons', () => {
    const coffee = [1, 2, 3].map((d) => txn({ note: 'Coffee', amount: c(3.8), date: `2026-10-1${d}` }));
    const lunch = [txn({ note: 'Lunch', amount: c(9.5), date: '2026-10-12' }), txn({ note: 'Lunch', amount: c(9.5), date: '2026-10-15' })];
    const once = txn({ note: 'Lamp', amount: c(40) });
    const u = usuals(snapshot({ txns: [...coffee, ...lunch, once] }), TODAY);
    expect(u.map((x) => [x.label, x.amount])).toEqual([
      ['Coffee', c(3.8)],
      ['Lunch', c(9.5)],
    ]);
  });
});

describe('detectSubscriptions', () => {
  it('spots monthly charges that are not repeats yet', () => {
    const spotify = ['2026-08-03', '2026-09-03', '2026-10-03'].map((date) => txn({ merchant: 'Spotify', amount: c(11.99), date }));
    expect(detectSubscriptions(snapshot({ txns: spotify }), TODAY).map((s) => s.name)).toEqual(['Spotify']);
    const known = snapshot({ txns: spotify, repeats: [repeat({ name: 'Spotify' })] });
    expect(detectSubscriptions(known, TODAY)).toEqual([]);
  });
});

describe('nudges', () => {
  it('asks for a balance check when it has been a while', () => {
    const old = account({ checkedAt: new Date('2026-10-10T09:00:00').getTime(), checkedOn: '2026-10-10' });
    expect(nudges(snapshot({ accounts: [old] }), TODAY, now).map((n) => n.id)).toContain('balance');
  });

  it('mentions an unpaid bill due tomorrow, gently', () => {
    const fresh = account({ checkedAt: now, checkedOn: TODAY });
    const electric = repeat({ name: 'Electricity', amount: c(73), anchor: '2026-01-21' });
    const n = nudges(snapshot({ accounts: [fresh], repeats: [electric] }), TODAY, now);
    expect(n[0]!.title).toBe('Electricity is due tomorrow');
    expect(n[0]!.claudePrompt).toContain('Use Sori');
  });
});

describe('small wins and streaks', () => {
  it('counts the three daily wins', () => {
    const s = snapshot({ accounts: [account({ checkedOn: TODAY })], txns: [txn({ date: TODAY })] });
    expect(winsFor(s, TODAY)).toMatchObject({ checkedBalance: true, tickedBills: true, logged: true, count: 3 });
  });

  it('forgives one missed day a week', () => {
    const days = ['2026-10-20', '2026-10-19', '2026-10-17', '2026-10-16', '2026-10-15'];
    const s = snapshot({ txns: days.map((date) => txn({ date })) });
    expect(streak(s, TODAY)).toEqual({ days: 5, usedFreePass: true });
  });

  it('does not count today against you before it is over', () => {
    const s = snapshot({ txns: [txn({ date: '2026-10-19' }), txn({ date: '2026-10-18' })] });
    expect(streak(s, TODAY).days).toBe(2);
  });

  it('has a gentle line for every day', () => {
    expect(dailyLine(TODAY)).toMatch(/\w/);
    expect(dailyLine('1960-01-01')).toMatch(/\w/);
  });
});
