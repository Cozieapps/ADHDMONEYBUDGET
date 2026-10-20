import { buildDemo, todayIn } from '@sori/core';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleMcp } from '../src/mcp';
import { loadSnapshot, putRecords, type WireRecord } from '../src/store';
import { MCP_HEADERS, ORIGIN, rpc } from './helpers';

async function mcp(method: string, params: unknown = {}) {
  const res = await handleMcp(new Request(`${ORIGIN}/mcp`, { method: 'POST', headers: MCP_HEADERS, body: rpc(1, method, params) }), env);
  expect(res.status).toBe(200);
  return (await res.json()) as { result: { content?: { text: string }[]; tools?: { name: string }[]; prompts?: { name: string }[]; messages?: unknown[] }; error?: unknown };
}

const text = (r: Awaited<ReturnType<typeof mcp>>) => r.result.content?.map((c) => c.text).join('\n') ?? '';

beforeAll(async () => {
  const demo = buildDemo(todayIn(undefined));
  const rows: WireRecord[] = [];
  const add = (kind: WireRecord['kind'], list: { id: string; updatedAt: number }[]) =>
    list.forEach((r) => rows.push({ kind, id: r.id, data: r as WireRecord['data'], updatedAt: r.updatedAt, deletedAt: null, source: 'app' }));
  add('settings', [demo.settings]);
  add('account', demo.accounts);
  add('category', demo.categories);
  add('txn', demo.txns);
  add('repeat', demo.repeats);
  add('budget', demo.budgets);
  add('goal', demo.goals);
  add('debt', demo.debts);
  add('wait', demo.waits);
  await putRecords(env.DB, rows);
});

describe('Claude connector (MCP)', () => {
  it('introduces itself with coaching instructions', async () => {
    const r = await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect(JSON.stringify(r.result)).toContain('Never shame');
  });

  it('offers read and write tools and prompts', async () => {
    const tools = (await mcp('tools/list')).result.tools!.map((t) => t.name);
    for (const name of ['get_overview', 'log_transaction', 'log_transactions_bulk', 'mark_bill_paid', 'contribute_to_goal', 'add_to_wait_list', 'can_i_afford']) {
      expect(tools).toContain(name);
    }
    expect((await mcp('prompts/list')).result.prompts!.map((p) => p.name)).toContain('daily-check-in');
  });

  it('gives an overview led by safe to spend', async () => {
    const out = text(await mcp('tools/call', { name: 'get_overview', arguments: {} }));
    expect(out).toMatch(/Safe to spend today: \$[\d,]+\.\d{2}/);
    expect(out).toContain('Emergency fund');
  });

  it('logs “23.40 lunch with Sam” in the right category, tagged as added by Claude', async () => {
    const out = text(await mcp('tools/call', { name: 'log_transaction', arguments: { amount: 23.4, description: 'Lunch with Sam' } }));
    expect(out).toContain('Eating out');
    expect(out).toContain('−$23.40');
    const row = await env.DB.prepare("SELECT data, source FROM records WHERE kind = 'txn' AND data LIKE '%Lunch with Sam%'").first<{ data: string; source: string }>();
    expect(row?.source).toBe('claude');
    expect(JSON.parse(row!.data).amount).toBe(2340);
  });

  it('logs a brain dump in one go', async () => {
    const out = text(
      await mcp('tools/call', {
        name: 'log_transactions_bulk',
        arguments: { entries: [{ amount: 4.5, description: 'coffee' }, { amount: 60, description: 'gas' }, { amount: 2100, description: 'paycheck', type: 'income' }] },
      }),
    );
    expect(out).toContain('Logged 3');
    expect(out).toContain('Coffee & treats');
    expect(out).toContain('Transport');
  });

  it('answers “can I afford it?”', async () => {
    expect(text(await mcp('tools/call', { name: 'can_i_afford', arguments: { amount: 5 } }))).toMatch(/^Yes/);
  });

  it('does not create envelope money when source and destination match', async () => {
    const before = await loadSnapshot(env.DB);
    const category = before.categories.find((c) => c.id === before.budgets[0]!.categoryId)!;
    const out = text(await mcp('tools/call', { name: 'move_money', arguments: { from_category: category.name, to_category: category.name, amount: 10 } }));
    expect(out).toContain('two different envelopes');
    expect((await loadSnapshot(env.DB)).budgets).toEqual(before.budgets);
  });

  it('rejects impossible dates and huge monthly budgets without writing', async () => {
    const before = await loadSnapshot(env.DB);
    const invalidDate = await mcp('tools/call', { name: 'log_transaction', arguments: { amount: 1, description: 'invalid-date-transaction', date: '2026-02-31' } });
    expect(JSON.stringify(invalidDate)).toContain('real YYYY-MM-DD date');
    const invalidBudget = await mcp('tools/call', { name: 'update_budget', arguments: { category: 'Groceries', monthly: 1e100 } });
    expect(JSON.stringify(invalidBudget)).toMatch(/error|Error/);
    expect((await loadSnapshot(env.DB)).txns).toEqual(before.txns);
    expect((await loadSnapshot(env.DB)).budgets).toEqual(before.budgets);
  });

  it('turns bad input into a friendly error', async () => {
    const r = await mcp('tools/call', { name: 'contribute_to_goal', arguments: { goal: 'Moon base', amount: 10 } });
    expect(text(r)).toContain('Which goal?');
  });
});
