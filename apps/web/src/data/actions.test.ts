import { beforeEach, expect, it } from 'vitest';
import { buildDemo } from '@sori/core';
import { db } from './db';
import { exportCSV, exportJSON, importJSON } from './actions';
import { buildSnapshot, save, wipeLocal } from './repo';

beforeEach(async () => { await wipeLocal(); });

it('restores a validated backup including real accounts and dates', async () => {
  const demo = buildDemo('2026-10-20');
  await importJSON(exportJSON(demo));
  const restored = buildSnapshot(await db.records.toArray());
  expect(restored.accounts.map((a) => a.balance)).toEqual(demo.accounts.map((a) => a.balance));
  expect(restored.txns).toHaveLength(demo.txns.length);
});

it('rejects corrupt or duplicate backup records before changing existing data', async () => {
  const demo = buildDemo('2026-10-20');
  await save({ kind: 'settings', record: { ...demo.settings, name: 'Keep me' } });
  for (const mutate of [
    () => ({ ...demo, accounts: [{ ...demo.accounts[0], balance: 0.5 }] }),
    () => ({ ...demo, repeats: [{ ...demo.repeats[0], anchor: '2026-02-31' }] }),
    () => ({ ...demo, accounts: [demo.accounts[0], demo.accounts[0]] }),
  ]) {
    await expect(importJSON(JSON.stringify({ app: 'sori-bloom', version: 1, snapshot: mutate() }))).rejects.toThrow(/invalid|duplicate/);
    expect(buildSnapshot(await db.records.toArray()).settings.name).toBe('Keep me');
    expect(await db.records.count()).toBe(1);
  }
});

it('escapes spreadsheet formulas and CSV quotes/newlines in user text', () => {
  const demo = buildDemo('2026-10-20');
  const first = demo.txns[0]!;
  demo.txns = [{ ...first, merchant: '=HYPERLINK("https://example.test")', note: '\t=1+1', tags: ['@formula'] }];
  const csv = exportCSV(demo);
  expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
  expect(csv).toContain("'\t=1+1");
  expect(csv).toContain("'@formula");
});
