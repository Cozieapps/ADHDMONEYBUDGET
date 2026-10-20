import { describe, expect, it } from 'vitest';
import { buildDemo } from './demo';
import { isISODate, isValidRecord } from './validation';
import { defaultSettings } from './factory';
import { account, goal, repeat, snapshot, txn } from './test-fixtures';
import type { RecordKind } from './types';

it('accepts all records created by the real demo and factory', () => {
  const demo = buildDemo('2026-10-20');
  const collections = { accounts: 'account', categories: 'category', txns: 'txn', repeats: 'repeat', budgets: 'budget', goals: 'goal', debts: 'debt', waits: 'wait', wins: 'win' } as const;
  expect(isValidRecord('settings', defaultSettings())).toBe(true);
  for (const [key, kind] of Object.entries(collections)) {
    for (const record of demo[key as keyof typeof collections]) expect(isValidRecord(kind as RecordKind, record), `${kind}:${record.id}`).toBe(true);
  }
  expect(snapshot().settings.id).toBe('settings');
});

describe('boundary record validation', () => {
  it('rejects impossible dates but accepts real leap days', () => {
    for (const date of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-01-00', '2026-1-1', '0001-01-01']) expect(isISODate(date)).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isValidRecord('repeat', repeat({ anchor: '2026-02-31' }))).toBe(false);
  });

  it('rejects malformed monetary data before calculations', () => {
    expect(isValidRecord('account', account({ balance: 10.5 as never }))).toBe(false);
    expect(isValidRecord('txn', txn({ amount: Number.MAX_SAFE_INTEGER as never }))).toBe(false);
    expect(isValidRecord('goal', { ...goal(), target: -1 })).toBe(false);
    expect(isValidRecord('txn', { ...txn(), tags: 'not-an-array' })).toBe(false);
    expect(isValidRecord('account', { id: 'bad', updatedAt: 1, source: 'app' })).toBe(false);
  });

  it('rejects settings that would crash formatting or reminders', () => {
    expect(isValidRecord('settings', { ...defaultSettings(), locale: 'not a locale' })).toBe(false);
    expect(isValidRecord('settings', { ...defaultSettings(), timeZone: 'no/such/zone' })).toBe(false);
    expect(isValidRecord('settings', { ...defaultSettings(), reminders: { checkInTime: '99:99' } })).toBe(false);
  });

  it('allows additive fields and minimal tombstones', () => {
    expect(isValidRecord('account', { ...account(), futureFeature: true })).toBe(true);
    expect(isValidRecord('account', { id: 'old', updatedAt: 5, deletedAt: 5, source: 'app' })).toBe(true);
  });
});
