import { describe, expect, it } from 'vitest';
import { planReminders, respectQuietHours } from './reminders';
import { account, c, repeat, snapshot, txn } from './test-fixtures';

const TODAY = '2026-10-20';
const now = new Date('2026-10-20T08:00:00').getTime();
const paycheck = repeat({ name: 'Paycheck', kind: 'income', isPaycheck: true, amount: c(2100), frequency: 'biweekly', anchor: '2026-10-02' });

describe('planReminders', () => {
  it('reminds before and on the day of a manual bill, not for autopay', () => {
    const electric = repeat({ name: 'Electricity', amount: c(73), anchor: '2026-01-23', remindDaysBefore: 2 });
    const gym = repeat({ name: 'Gym', amount: c(29), anchor: '2026-01-22', autopay: true });
    const list = planReminders(snapshot({ accounts: [account()], repeats: [electric, gym] }), TODAY, now, 7).filter((r) => r.kind === 'bill');
    expect(list.map((r) => r.title)).toEqual(['Electricity is due in 2 days', 'Electricity is due today']);
    expect(new Date(list[0]!.at).getDate()).toBe(21);
  });

  it('celebrates paydays and plans a daily check-in, skipping today once logged', () => {
    const s = snapshot({ accounts: [account()], repeats: [paycheck], txns: [txn({ date: TODAY })] });
    const list = planReminders(s, TODAY, now, 3);
    expect(list.filter((r) => r.kind === 'check-in').map((r) => new Date(r.at).getDate())).toEqual([21, 22]);
    expect(planReminders(s, TODAY, now, 14).some((r) => r.kind === 'payday' && r.title.startsWith('Payday'))).toBe(true);
  });

  it('uses stable ids so re-planning replaces reminders', () => {
    const s = snapshot({ accounts: [account()], repeats: [paycheck] });
    expect(planReminders(s, TODAY, now).map((r) => r.id)).toEqual(planReminders(s, TODAY, now).map((r) => r.id));
  });

  it('respects the owner’s toggles', () => {
    const s = snapshot({ accounts: [account()], repeats: [paycheck] });
    s.settings.reminders = { ...s.settings.reminders, checkIn: false, payday: false };
    expect(planReminders(s, TODAY, now).filter((r) => r.kind === 'check-in' || r.kind === 'payday')).toEqual([]);
  });
});

describe('respectQuietHours', () => {
  const prefs = { quietStart: '21:30', quietEnd: '08:00' };
  it('moves a late-night reminder to the morning', () => {
    const moved = new Date(respectQuietHours(new Date('2026-10-20T23:00:00').getTime(), prefs));
    expect([moved.getDate(), moved.getHours()]).toEqual([21, 8]);
  });
  it('leaves daytime reminders alone', () => {
    const t = new Date('2026-10-20T12:00:00').getTime();
    expect(respectQuietHours(t, prefs)).toBe(t);
  });
});
