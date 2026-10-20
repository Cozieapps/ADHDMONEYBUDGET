import { describe, expect, it } from 'vitest';
import { buildDemo } from './demo';
import { forecast } from './forecast';
import { nudges, usuals } from './patterns';
import { safeToSpend } from './safe-to-spend';

describe('example data', () => {
  const today = '2026-10-20';
  const now = new Date('2026-10-20T14:00:00').getTime();
  const demo = buildDemo(today, now);

  it('produces a healthy, believable picture', () => {
    const s = safeToSpend(demo, today);
    expect(s.paydayKnown).toBe(true);
    expect(s.daysLeft).toBe(8);
    expect(s.perDay).toBeGreaterThan(0);
    expect(s.bills).toBeGreaterThan(0);
    expect(s.goals).toBeGreaterThan(0);
    expect(demo.txns.length).toBeGreaterThan(60);
  });

  it('has usuals, nudges and a forecast to show', () => {
    expect(usuals(demo, today).map((u) => u.label)).toContain('Coffee');
    expect(nudges(demo, today, now).length).toBeGreaterThan(0);
    expect(forecast(demo, today, 30).learnedDailySpend).toBe(true);
  });

  it('is deterministic', () => {
    expect(buildDemo(today, now).txns.map((t) => t.amount)).toEqual(demo.txns.map((t) => t.amount));
  });
});
