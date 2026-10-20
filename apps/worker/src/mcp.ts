import {
  addDays,
  isISODate,
  addToGoal,
  type Budget,
  budgetId,
  canIAfford,
  type Cents,
  createTxn,
  discretionary,
  endOfMonth,
  forecast,
  formatCents,
  type Frequency,
  type Goal,
  guessCategory,
  markRepeatPaid,
  meta,
  minimumsOnly,
  netSpend,
  nextOccurrence,
  nudges,
  patternsFound,
  progress,
  type Repeat,
  type RepeatKind,
  safeToSpend,
  scheduleBetween,
  simulatePayoff,
  type Snapshot,
  spendByCategory,
  startOfMonth,
  streak,
  todayIn,
  type Tone,
  type Txn,
  usuals,
  type WaitItem,
  winsFor,
} from '@sori/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { loadSnapshot, saveFromClaude } from './store';

export const INSTRUCTIONS = `Sori is the owner's ADHD-friendly budgeting app. Use these tools to see their money and to log or plan things for them.

How to coach:
- Be warm, brief and concrete. Lead with the one number that matters (safe to spend today), then at most 2–3 points.
- Never shame. Overspending is "let's re-plan", a missed day is "a pause, not a failure". Celebrate small wins.
- ADHD-friendly: one clear next step, short lists, no walls of text. Offer to do the tedious part (logging, ticking bills) for them.
- When they describe purchases in their own words, call log_transaction (or log_transactions_bulk for several). Amounts are in dollars (e.g. 12.5). Confirm what you saved in one line.
- For impulse buys: ask how they'll feel tomorrow, check can_i_afford, and suggest add_to_wait_list (48-hour pause) without judging.
- Everything you write is tagged "Claude added this" in Sori and the owner can undo it. Ask before deleting anything.
- This is guidance, not financial advice.

Key ideas: "safe to spend today" = (money in spending accounts − bills, debt minimums and goal money due before payday − safety buffer) ÷ days until payday. Envelopes (budgets) cover everyday spending; bills are "repeats".`;

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };

const ok = (text: string): Result => ({ content: [{ type: 'text', text }] });
const fail = (text: string): Result => ({ content: [{ type: 'text', text }], isError: true });

function toCents(dollars: number): Cents {
  const cents = Math.round(dollars * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 100_000_000) throw new RangeError('Amount must be a positive number of dollars.');
  return cents as Cents;
}

interface Ctx {
  db: D1Database;
  snapshot: Snapshot;
  today: string;
  money: (c: number) => string;
}

/** The connector only needs the database. */
type McpEnv = Pick<Env, 'DB'>;

async function context(env: McpEnv): Promise<Ctx> {
  const snapshot = await loadSnapshot(env.DB);
  const { currency, locale, timeZone } = snapshot.settings;
  return { db: env.DB, snapshot, today: todayIn(timeZone), money: (c) => formatCents(c as Cents, currency, locale) };
}

function match<T extends { id: string; name: string }>(list: T[], query: string): T | T[] {
  const q = query.trim().toLowerCase();
  const exact = list.find((x) => x.id === query || x.name.toLowerCase() === q);
  if (exact) return exact;
  const partial = list.filter((x) => x.name.toLowerCase().includes(q) || q.includes(x.name.toLowerCase()));
  return partial.length === 1 ? partial[0]! : partial.length ? partial : list;
}

function categoryFor(c: Ctx, name: string | undefined, text: string, type: 'spend' | 'income' | 'refund'): string | undefined {
  if (name) {
    const kind = type === 'income' ? 'income' : 'spend';
    const found = match(c.snapshot.categories.filter((x) => x.kind === kind), name);
    if (!Array.isArray(found)) return found.id;
  }
  return guessCategory(text, type, c.snapshot.categories, c.snapshot.txns);
}

function catName(c: Ctx, id?: string) {
  return c.snapshot.categories.find((x) => x.id === id)?.name ?? 'Uncategorized';
}

function txnLine(c: Ctx, t: Txn): string {
  const sign = t.type === 'income' || t.type === 'refund' || (t.type === 'transfer' && t.inbound) ? '+' : '−';
  const tags = t.tags.length ? ` #${t.tags.join(' #')}` : '';
  return `${t.date} · ${t.note || t.merchant || '—'} · ${catName(c, t.categoryId)} · ${sign}${c.money(t.amount)}${tags}${t.source === 'claude' ? ' · (added by Claude)' : ''} · id:${t.id}`;
}

function overview(c: Ctx): string {
  const s = safeToSpend(c.snapshot, c.today);
  const wins = winsFor(c.snapshot, c.today);
  const run = streak(c.snapshot, c.today);
  const upcoming = scheduleBetween(c.snapshot, c.today, addDays(c.today, 7)).filter((i) => !i.paid);
  const goals = c.snapshot.goals.filter((g) => !g.archived);
  const debts = c.snapshot.debts.filter((d) => d.balance > 0);
  const plan = debts.length ? simulatePayoff(debts, { strategy: c.snapshot.settings.debtStrategy, extra: c.snapshot.settings.debtExtra, customOrder: c.snapshot.settings.debtOrder, start: c.today }) : undefined;
  const watch = nudges(c.snapshot, c.today).slice(0, 4);
  const lines = [
    `Owner: ${c.snapshot.settings.name || 'the owner'} · today ${c.today}${c.snapshot.settings.setupDone ? '' : ' · setup not finished yet'}`,
    `Safe to spend today: ${c.money(Math.max(0, s.leftToday))} (allowance ${c.money(s.perDay)}/day, spent ${c.money(s.spentToday)} today). ${c.money(s.untilPayday)} to last ${s.daysLeft} days until ${s.paydayKnown ? `payday ${s.nextPayday}` : `month end`}. Status: ${s.status}.`,
    `Breakdown: accounts ${c.money(s.accounts)}${s.incoming ? ` + incoming ${c.money(s.incoming)}` : ''} − bills ${c.money(s.bills)}${s.billItems.length ? ` (${s.billItems.map((b) => `${b.name} ${b.date}`).join(', ')})` : ''} − debt minimums ${c.money(s.debts)} − goals ${c.money(s.goals)} − buffer ${c.money(s.buffer)}.`,
    `Next 7 days: ${upcoming.length ? upcoming.map((i) => `${i.date} ${i.name} ${i.isIncome ? '+' : '−'}${c.money(i.amount)}${i.autopay ? ' (autopay)' : ''}`).join('; ') : 'nothing scheduled'}.`,
    `Small wins today: ${wins.count}/3 (balance checked: ${wins.checkedBalance ? 'yes' : 'no'}, bills ticked: ${wins.tickedBills ? 'yes' : 'no'}, logged: ${wins.logged ? 'yes' : 'no'}). Streak: ${run.days} days.`,
    `Goals: ${goals.length ? goals.map((g) => `${g.emoji} ${g.name} ${c.money(g.saved)}/${c.money(g.target)} (${Math.round(progress(g) * 100)}%)`).join('; ') : 'none yet'}.`,
    `Debt: ${debts.length ? `${c.money(debts.reduce((x, d) => x + d.balance, 0))} total; debt-free ~${plan!.neverEnds ? 'not in sight at current payments' : plan!.debtFreeDate.slice(0, 7)} (${c.snapshot.settings.debtStrategy}, +${c.money(c.snapshot.settings.debtExtra)}/mo extra)` : 'none'}.`,
    `Worth a look: ${watch.length ? watch.map((n) => `${n.title} — ${n.body}`).join(' | ') : 'all calm'}.`,
  ];
  return lines.join('\n');
}

const FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'yearly'] as const;
const TONES: Tone[] = ['peach', 'lavender', 'mint', 'butter', 'pink', 'sky'];

export function createServer(env: McpEnv): McpServer {
  const server = new McpServer({ name: 'sori', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  const read = { readOnlyHint: true, openWorldHint: false } as const;
  const wholeDollars = z.number().min(0).max(1_000_000).refine((n) => Number.isSafeInteger(Math.round(n * 100)), 'Amount must fit integer cents');
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

  /** Loads fresh data for each call and turns errors into a friendly tool error. */
  const use = async (fn: (c: Ctx) => Promise<Result> | Result): Promise<Result> => {
    try {
      return await fn(await context(env));
    } catch (e) {
      return fail((e as Error).message);
    }
  };
  const run = (fn: (c: Ctx) => Promise<Result> | Result) => () => use(fn);

  // ---------------- read ----------------

  server.registerTool('get_overview', { title: 'Money overview', description: 'Start here: safe-to-spend today with its breakdown, what is due this week, small wins, goals, debt and anything worth a look.', annotations: read }, run((c) => ok(overview(c))));

  server.registerTool(
    'get_safe_to_spend',
    { title: 'Safe to spend', description: 'Exactly how today’s safe-to-spend number is calculated.', annotations: read },
    run((c) => {
      const s = safeToSpend(c.snapshot, c.today);
      return ok(
        [
          `Safe to spend today: ${c.money(Math.max(0, s.leftToday))} (${c.money(s.perDay)} per day, ${c.money(s.spentToday)} spent today).`,
          `Money in spending accounts ${c.money(s.accounts)}`,
          s.incoming ? `+ expected before payday ${c.money(s.incoming)} (${s.incomeItems.map((i) => i.name).join(', ')})` : '',
          `− bills before payday ${c.money(s.bills)}: ${s.billItems.map((b) => `${b.name} ${c.money(b.amount)} on ${b.date}`).join(', ') || 'none'}`,
          `− debt minimums ${c.money(s.debts)}: ${s.debtItems.map((b) => `${b.name} ${c.money(b.amount)} on ${b.date}`).join(', ') || 'none'}`,
          `− goal money this pay period ${c.money(s.goals)}: ${s.goalItems.map((g) => `${g.name} ${c.money(g.amount)}`).join(', ') || 'none'}`,
          `− safety buffer ${c.money(s.buffer)}`,
          `= ${c.money(s.untilPayday)} until ${s.nextPayday} ÷ ${s.daysLeft} days.`,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }),
  );

  server.registerTool(
    'get_forecast',
    { title: 'Forecast', description: 'Projected balance for the next 30/60/90 days: lowest point and key events.', inputSchema: { days: z.union([z.literal(30), z.literal(60), z.literal(90)]).default(30) }, annotations: read },
    async ({ days }) =>
      use((c) => {
        const f = forecast(c.snapshot, c.today, days);
        const events = f.days.flatMap((d) => d.events.map((e) => `${d.date} ${e.name} ${e.amount > 0 ? '+' : '−'}${c.money(Math.abs(e.amount))}`));
        return ok(
          [
            `Now ${c.money(f.start)}. Lowest point ${c.money(f.lowest.balance)} on ${f.lowest.date}. In ${days} days about ${c.money(f.end.balance)}.`,
            `Protected amount (buffer + goal money) ${c.money(f.protectedAmount)}${f.firstDayBelowProtected ? `; first day below buffer: ${f.firstDayBelowProtected}` : '; stays above buffer'}.`,
            `Assumes ${c.money(f.dailySpend)}/day everyday spending (${f.learnedDailySpend ? 'learned from history' : 'today’s allowance'}).`,
            `Events: ${events.slice(0, 25).join('; ') || 'none'}${events.length > 25 ? ` … and ${events.length - 25} more` : ''}`,
          ].join('\n'),
        );
      }),
  );

  server.registerTool(
    'query_transactions',
    {
      title: 'Find transactions',
      description: 'List logged transactions, newest first. Filter by date range, category name or text.',
      inputSchema: {
        from: z.string().refine(isISODate, 'Use a real YYYY-MM-DD date').optional().describe('YYYY-MM-DD'),
        to: z.string().refine(isISODate, 'Use a real YYYY-MM-DD date').optional().describe('YYYY-MM-DD'),
        category: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: read,
    },
    async (args) =>
      use((c) => {
        let list = c.snapshot.txns.filter((t) => t.type !== 'transfer');
        if (args.from) list = list.filter((t) => t.date >= args.from!);
        if (args.to) list = list.filter((t) => t.date <= args.to!);
        if (args.category) list = list.filter((t) => catName(c, t.categoryId).toLowerCase().includes(args.category!.toLowerCase()));
        if (args.search) {
          const q = args.search.toLowerCase();
          list = list.filter((t) => `${t.note ?? ''} ${t.merchant ?? ''} ${t.tags.join(' ')}`.toLowerCase().includes(q));
        }
        list.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
        const page = list.slice(args.offset, args.offset + args.limit);
        return ok(`${list.length} matching (showing ${page.length}, total spent ${c.money(netSpend(list))}):\n${page.map((t) => txnLine(c, t)).join('\n') || 'none'}`);
      }),
  );

  server.registerTool(
    'get_spending_summary',
    { title: 'Spending summary', description: 'One month by category: everyday spending vs plan, bills, income and savings.', inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('YYYY-MM, default this month') }, annotations: read },
    async ({ month }) =>
      use((c) => {
        const from = `${month ?? c.today.slice(0, 7)}-01`;
        const to = endOfMonth(from);
        const txns = c.snapshot.txns.filter((t) => t.date >= from && t.date <= to);
        const everyday = spendByCategory(discretionary(txns));
        const rows = c.snapshot.categories
          .filter((cat) => cat.kind === 'spend')
          .map((cat) => ({ cat, spent: everyday.get(cat.id) ?? 0, plan: c.snapshot.budgets.find((b) => b.categoryId === cat.id)?.monthly ?? 0 }))
          .filter((r) => r.spent || r.plan)
          .sort((a, b) => b.spent - a.spent);
        const income = txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const bills = netSpend(txns.filter((t) => t.repeatId && t.type === 'spend'));
        return ok(
          [
            `${from.slice(0, 7)}: money in ${c.money(income)}, bills ${c.money(bills)}, everyday ${c.money(netSpend(discretionary(txns)))}.`,
            ...rows.map((r) => `${r.cat.emoji} ${r.cat.name}: ${c.money(r.spent)}${r.plan ? ` of ${c.money(r.plan)} planned (${r.spent > r.plan ? `${c.money(r.spent - r.plan)} over` : `${c.money(r.plan - r.spent)} left`})` : ' (no plan)'}`),
          ].join('\n'),
        );
      }),
  );

  server.registerTool(
    'get_patterns',
    { title: 'Patterns and nudges', description: 'What Sori noticed: nudges, spending patterns, usual purchases and possible subscriptions.', annotations: read },
    run((c) => {
      const n = nudges(c.snapshot, c.today);
      const p = patternsFound(c.snapshot, c.today);
      const u = usuals(c.snapshot, c.today, 6);
      return ok(
        [
          `Nudges: ${n.map((x) => `${x.title} — ${x.body}`).join(' | ') || 'none'}`,
          `Patterns: ${p.map((x) => `${x.title} — ${x.body}`).join(' | ') || 'not enough history yet'}`,
          `Usual purchases: ${u.map((x) => `${x.label} ${c.money(x.amount)} (${x.count}×)`).join(', ') || 'none yet'}`,
        ].join('\n'),
      );
    }),
  );

  server.registerTool(
    'list_bills',
    { title: 'Bills, subscriptions and income', description: 'All repeats with their next date, plus what is due in the next 30 days and whether it is ticked off.', annotations: read },
    run((c) => {
      const all = c.snapshot.repeats.map((r) => `${r.name} (${r.kind}, ${r.frequency}${r.autopay ? ', autopay' : ''}${r.isPaycheck ? ', main paycheck' : ''}${r.active ? '' : ', paused'}) ${c.money(r.amount)} · next ${nextOccurrence(r, addDays(c.today, -1)) ?? '—'} · id:${r.id}`);
      const due = scheduleBetween(c.snapshot, addDays(c.today, -7), addDays(c.today, 30)).map((i) => `${i.date} ${i.name} ${c.money(i.amount)} ${i.paid ? '✓ ticked' : i.date < c.today ? '(not ticked)' : ''}`);
      return ok(`Repeats:\n${all.join('\n') || 'none'}\n\nLast week + next 30 days:\n${due.join('\n') || 'nothing'}`);
    }),
  );

  server.registerTool(
    'list_goals',
    { title: 'Goals', description: 'Savings goals with progress, monthly amount and estimated finish.', annotations: read },
    run((c) =>
      ok(
        c.snapshot.goals
          .map((g) => {
            const months = g.monthly > 0 ? Math.ceil(Math.max(0, g.target - g.saved) / g.monthly) : undefined;
            return `${g.emoji} ${g.name}${g.kind === 'emergency' ? ' (emergency fund)' : ''}: ${c.money(g.saved)} of ${c.money(g.target)} (${Math.round(progress(g) * 100)}%), ${c.money(g.monthly)}/month${months !== undefined ? `, ~${months} months to go` : ''}${g.targetDate ? `, target ${g.targetDate}` : ''} · id:${g.id}`;
          })
          .join('\n') || 'No goals yet.',
      ),
    ),
  );

  server.registerTool(
    'list_debts',
    { title: 'Debts and payoff plan', description: 'Debts with APR and minimums, the payoff order and debt-free date for each strategy.', annotations: read },
    run((c) => {
      const debts = c.snapshot.debts.filter((d) => d.balance > 0);
      if (!debts.length) return ok('No debts recorded.');
      const s = c.snapshot.settings;
      const lines = debts.map((d) => `${d.name}: ${c.money(d.balance)} at ${d.apr}% APR, minimum ${c.money(d.minimum)} due day ${d.dueDay} · id:${d.id}`);
      for (const strategy of ['snowball', 'avalanche'] as const) {
        const p = simulatePayoff(debts, { strategy, extra: s.debtExtra, start: c.today });
        lines.push(`${strategy}: debt-free ${p.neverEnds ? 'never at this rate' : p.debtFreeDate.slice(0, 7)}, interest ${c.money(p.totalInterest)}`);
      }
      const base = minimumsOnly(debts, c.today);
      lines.push(`minimums only: ${base.neverEnds ? 'never finishes' : base.debtFreeDate.slice(0, 7)}, interest ${c.money(base.totalInterest)}. Current plan: ${s.debtStrategy} with ${c.money(s.debtExtra)}/month extra.`);
      return ok(lines.join('\n'));
    }),
  );

  server.registerTool(
    'list_budgets',
    { title: 'Envelopes', description: 'Monthly plan per category with what is spent so far this month.', annotations: read },
    run((c) => {
      const from = startOfMonth(c.today);
      const spent = spendByCategory(discretionary(c.snapshot.txns.filter((t) => t.date >= from && t.date <= c.today)));
      return ok(c.snapshot.budgets.map((b) => `${catName(c, b.categoryId)}: ${c.money(spent.get(b.categoryId) ?? 0)} of ${c.money(b.monthly)}`).join('\n') || 'No envelopes planned yet.');
    }),
  );

  server.registerTool(
    'can_i_afford',
    { title: 'Can I afford it?', description: 'Checks a purchase against today’s amount and the money needed before payday.', inputSchema: { amount: z.number().positive().describe('Dollars'), date: z.string().refine(isISODate, 'Use a real YYYY-MM-DD date').optional() }, annotations: read },
    async ({ amount, date }) =>
      use((c) => {
        const cents = toCents(amount);
        const a = canIAfford(c.snapshot, c.today, cents, date ?? c.today);
        const s = safeToSpend(c.snapshot, c.today);
        const text =
          a.verdict === 'yes'
            ? `Yes — it fits in today’s ${c.money(s.leftToday)}; ${c.money(a.leftTodayAfter)} would be left today.`
            : a.verdict === 'stretch'
              ? `A stretch: it fits before payday but lowers the daily amount from ${c.money(s.perDay)} to ${c.money(a.perDayAfter)} until ${s.nextPayday}.`
              : `Not before payday: it would leave about ${c.money(a.shortBy)} short for bills and the buffer. Suggest waiting or the 48-hour wait list.`;
        return ok(`${text} Lowest point after: ${c.money(a.lowestAfter.balance)} on ${a.lowestAfter.date}.`);
      }),
  );

  // ---------------- write ----------------

  const entry = z.object({
    amount: z.number().positive().describe('Dollars, e.g. 12.5'),
    description: z.string().min(1).max(120).describe('What it was, in the owner’s words'),
    type: z.enum(['spend', 'income', 'refund']).default('spend'),
    category: z.string().optional().describe('Category name; guessed from the description if omitted'),
    merchant: z.string().max(80).optional(),
    date: z.string().refine(isISODate, 'Use a real YYYY-MM-DD date').optional().describe('YYYY-MM-DD, default today'),
    tags: z.array(z.string().max(30)).max(5).optional(),
  });

  function buildTxn(c: Ctx, e: z.infer<typeof entry>): Txn {
    const categoryId = categoryFor(c, e.category, `${e.description} ${e.merchant ?? ''}`, e.type);
    return createTxn(
      {
        date: e.date ?? c.today,
        amount: toCents(e.amount),
        type: e.type,
        note: e.description,
        tags: (e.tags ?? []).map((t) => t.replace(/^#/, '').toLowerCase()),
        ...(categoryId ? { categoryId } : {}),
        ...(e.merchant ? { merchant: e.merchant } : {}),
      },
      'claude',
    );
  }

  server.registerTool(
    'log_transaction',
    { title: 'Log a transaction', description: 'Saves one purchase, income or refund in Sori. Use the owner’s own words as the description.', inputSchema: entry.shape, annotations: write },
    async (args) =>
      use(async (c) => {
        const txn = buildTxn(c, args);
        await saveFromClaude(c.db, [{ kind: 'txn', record: txn }]);
        const after = safeToSpend({ ...c.snapshot, txns: [...c.snapshot.txns, txn] }, c.today);
        return ok(`Logged: ${txnLine(c, txn)}\nSafe to spend today is now ${c.money(Math.max(0, after.leftToday))}. (It shows in Sori as “Claude added this” with undo.)`);
      }),
  );

  server.registerTool(
    'log_transactions_bulk',
    { title: 'Log several transactions', description: 'Saves several entries at once — for brain dumps or pasted receipts.', inputSchema: { entries: z.array(entry).min(1).max(30) }, annotations: write },
    async ({ entries }) =>
      use(async (c) => {
        const txns = entries.map((e) => buildTxn(c, e));
        await saveFromClaude(c.db, txns.map((record) => ({ kind: 'txn' as const, record })));
        return ok(`Logged ${txns.length}:\n${txns.map((t) => txnLine(c, t)).join('\n')}`);
      }),
  );

  server.registerTool(
    'edit_transaction',
    {
      title: 'Edit a transaction',
      description: 'Changes an existing transaction by id (from query_transactions).',
      inputSchema: { id: z.string(), amount: z.number().positive().optional(), description: z.string().max(120).optional(), category: z.string().optional(), date: z.string().refine(isISODate, 'Use a real YYYY-MM-DD date').optional() },
      annotations: write,
    },
    async (args) =>
      use(async (c) => {
        const t = c.snapshot.txns.find((x) => x.id === args.id);
        if (!t) return fail('No transaction with that id. Use query_transactions to find it.');
        const updated: Txn = { ...t };
        if (args.amount) updated.amount = toCents(args.amount);
        if (args.description) updated.note = args.description;
        if (args.date) updated.date = args.date;
        if (args.category) {
          const id = categoryFor(c, args.category, args.category, t.type === 'income' ? 'income' : 'spend');
          if (id) updated.categoryId = id;
        }
        await saveFromClaude(c.db, [{ kind: 'txn', record: updated }]);
        return ok(`Updated: ${txnLine(c, updated)}`);
      }),
  );

  server.registerTool(
    'delete_transaction',
    { title: 'Remove a transaction', description: 'Removes a transaction by id. Ask the owner first.', inputSchema: { id: z.string() }, annotations: { ...write, destructiveHint: true } },
    async ({ id }) =>
      use(async (c) => {
        const t = c.snapshot.txns.find((x) => x.id === id);
        if (!t) return fail('No transaction with that id.');
        await saveFromClaude(c.db, [{ kind: 'txn', record: { ...t, deletedAt: Date.now() } }]);
        return ok(`Removed: ${txnLine(c, t)}`);
      }),
  );

  server.registerTool(
    'add_bill',
    {
      title: 'Add a bill, subscription or income',
      description: 'Adds something that repeats on a schedule. Sori reminds the owner and plans for it.',
      inputSchema: {
        name: z.string().min(1).max(60),
        amount: z.number().positive().describe('Dollars'),
        kind: z.enum(['bill', 'subscription', 'income', 'saving']).default('bill'),
        frequency: z.enum(FREQUENCIES).default('monthly'),
        next_date: z.string().refine(isISODate, 'Use a real YYYY-MM-DD date').describe('Next due date YYYY-MM-DD'),
        autopay: z.boolean().default(false),
        category: z.string().optional(),
      },
      annotations: write,
    },
    async (args) =>
      use(async (c) => {
        const kind = args.kind as RepeatKind;
        const categoryId = categoryFor(c, args.category, args.name, kind === 'income' ? 'income' : 'spend');
        const repeat: Repeat = {
          ...meta('claude'),
          name: args.name,
          kind,
          amount: toCents(args.amount),
          frequency: args.frequency as Frequency,
          anchor: args.next_date,
          autopay: args.autopay,
          remindDaysBefore: 2,
          paid: [],
          active: true,
          ...(categoryId ? { categoryId } : {}),
        };
        await saveFromClaude(c.db, [{ kind: 'repeat', record: repeat }]);
        return ok(`Added ${repeat.name}: ${c.money(repeat.amount)} ${repeat.frequency}, next ${repeat.anchor}${repeat.autopay ? ' (autopay)' : ''}.`);
      }),
  );

  server.registerTool(
    'mark_bill_paid',
    { title: 'Tick off a bill', description: 'Marks a bill paid (or income arrived) for a date and logs it.', inputSchema: { bill: z.string().describe('Name or id'), date: z.string().refine(isISODate, 'Use a real YYYY-MM-DD date').optional().describe('Due date being paid; default the nearest unpaid one') }, annotations: write },
    async ({ bill, date }) =>
      use(async (c) => {
        const found = match(c.snapshot.repeats, bill);
        if (Array.isArray(found)) return fail(`Which one? ${found.map((r) => r.name).join(', ') || 'No repeats yet.'}`);
        const due = date ?? scheduleBetween(c.snapshot, addDays(c.today, -35), addDays(c.today, 10)).find((i) => i.refId === found.id && !i.paid)?.date;
        if (!due) return fail(`${found.name} has nothing unpaid around now.`);
        const { repeat, txn } = markRepeatPaid(found, due, 'claude');
        await saveFromClaude(c.db, [{ kind: 'repeat', record: repeat }, { kind: 'txn', record: txn }]);
        return ok(`${found.name} for ${due} is ticked off (${c.money(found.amount)}). 🎉`);
      }),
  );

  server.registerTool(
    'update_budget',
    { title: 'Set an envelope', description: 'Sets the monthly plan for a spending category.', inputSchema: { category: z.string(), monthly: wholeDollars.describe('Dollars per month') }, annotations: write },
    async ({ category, monthly }) =>
      use(async (c) => {
        const id = categoryFor(c, category, category, 'spend');
        if (!id) return fail('Unknown category.');
        const existing = c.snapshot.budgets.find((b) => b.categoryId === id);
        const record: Budget = { ...(existing ?? { ...meta('claude'), id: budgetId(id), categoryId: id }), monthly: Math.round(monthly * 100) as Cents };
        await saveFromClaude(c.db, [{ kind: 'budget', record }]);
        return ok(`${catName(c, id)} is now planned at ${c.money(record.monthly)} a month.`);
      }),
  );

  server.registerTool(
    'move_money',
    { title: 'Move money between envelopes', description: 'Re-plans: moves part of one category’s monthly plan to another.', inputSchema: { from_category: z.string(), to_category: z.string(), amount: z.number().positive() }, annotations: write },
    async (args) =>
      use(async (c) => {
        const fromId = categoryFor(c, args.from_category, args.from_category, 'spend');
        const toId = categoryFor(c, args.to_category, args.to_category, 'spend');
        if (fromId === toId) return fail('Choose two different envelopes; moving money to itself changes nothing.');
        const from = c.snapshot.budgets.find((b) => b.categoryId === fromId);
        if (!from || !toId) return fail('Both categories need to exist, and the first one needs a plan.');
        const take = Math.min(toCents(args.amount), from.monthly) as Cents;
        const to = c.snapshot.budgets.find((b) => b.categoryId === toId);
        await saveFromClaude(c.db, [
          { kind: 'budget', record: { ...from, monthly: (from.monthly - take) as Cents } },
          { kind: 'budget', record: to ? { ...to, monthly: (to.monthly + take) as Cents } : { ...meta('claude'), id: budgetId(toId), categoryId: toId, monthly: take } },
        ]);
        return ok(`Moved ${c.money(take)} from ${catName(c, fromId)} to ${catName(c, toId)}.`);
      }),
  );

  server.registerTool(
    'add_goal',
    {
      title: 'Start a savings goal',
      description: 'Creates a savings jar.',
      inputSchema: { name: z.string().min(1).max(60), target: z.number().positive(), monthly: wholeDollars.default(0), target_date: z.string().refine(isISODate, 'Use a real YYYY-MM-DD date').optional(), emoji: z.string().max(4).default('🌱'), emergency_fund: z.boolean().default(false) },
      annotations: write,
    },
    async (args) =>
      use(async (c) => {
        const goal: Goal = {
          ...meta('claude'),
          name: args.name,
          emoji: args.emoji,
          tone: TONES[c.snapshot.goals.length % TONES.length]!,
          kind: args.emergency_fund ? 'emergency' : 'goal',
          target: toCents(args.target),
          saved: 0 as Cents,
          monthly: Math.round(args.monthly * 100) as Cents,
          ...(args.target_date ? { targetDate: args.target_date } : {}),
        };
        await saveFromClaude(c.db, [{ kind: 'goal', record: goal }]);
        return ok(`New jar: ${goal.emoji} ${goal.name}, target ${c.money(goal.target)}, ${c.money(goal.monthly)}/month.`);
      }),
  );

  server.registerTool(
    'contribute_to_goal',
    { title: 'Add money to a goal', description: 'Moves money from checking into a goal.', inputSchema: { goal: z.string().describe('Name or id'), amount: z.number().positive() }, annotations: write },
    async ({ goal, amount }) =>
      use(async (c) => {
        const found = match(c.snapshot.goals, goal);
        if (Array.isArray(found)) return fail(`Which goal? ${found.map((g) => g.name).join(', ') || 'No goals yet.'}`);
        const { goal: updated, txn } = addToGoal(found, toCents(amount), c.today, 'claude');
        await saveFromClaude(c.db, [{ kind: 'goal', record: updated }, { kind: 'txn', record: txn }]);
        return ok(`${updated.emoji} ${updated.name}: now ${c.money(updated.saved)} of ${c.money(updated.target)} (${Math.round(progress(updated) * 100)}%).`);
      }),
  );

  server.registerTool(
    'add_to_wait_list',
    { title: 'Park an impulse buy', description: 'Adds something to the 48-hour wait list; Sori asks the owner again in 48 hours.', inputSchema: { name: z.string().min(1).max(60), amount: z.number().positive(), link: z.string().url().optional() }, annotations: write },
    async ({ name, amount, link }) =>
      use(async (c) => {
        const now = Date.now();
        const item: WaitItem = { ...meta('claude', now), name, amount: toCents(amount), addedAt: now, decideAfter: now + 48 * 3_600_000, status: 'waiting', ...(link ? { link } : {}) };
        await saveFromClaude(c.db, [{ kind: 'wait', record: item }]);
        return ok(`Parked “${name}” (${c.money(item.amount)}) for 48 hours. Sori will ask again then.`);
      }),
  );

  // ---------------- prompts ----------------

  const prompt = (name: string, title: string, text: (extra?: string) => string, arg?: string) =>
    server.registerPrompt(
      name,
      { title, description: title, ...(arg ? { argsSchema: { details: z.string().optional().describe(arg) } } : {}) },
      (args: { details?: string }) => ({ messages: [{ role: 'user', content: { type: 'text', text: text(args?.details) } }] }),
    );

  prompt('daily-check-in', 'Daily check-in', () => 'Use Sori to do my daily check-in: what’s safe to spend today, anything due soon, and one small win to aim for. Keep it short and kind.');
  prompt('log-for-me', 'Log for me', (d) => `Use Sori to log what I spent. ${d ?? 'I’ll tell you in my own words.'}`, 'What you spent, in your own words');
  prompt('how-am-i-doing', 'How am I doing?', () => 'Use Sori: how am I doing this month? Be honest and kind, three points max.');
  prompt('plan-my-paycheck', 'Plan my paycheck', () => 'Use Sori to help me plan my next paycheck: bills first, then goals, debt and guilt-free fun money.');
  prompt('impulse-pause', 'Impulse pause', (d) => `Use Sori: I want to buy something right now${d ? ` — ${d}` : ''}. Help me pause and decide without judging me.`, 'What you want to buy');
  prompt('weekly-review', 'Weekly review', () => 'Use Sori to run my weekly money review: wins, patterns, what’s coming next week, and one small thing to try.');
  prompt('debt-strategy', 'Debt strategy', () => 'Use Sori to look at my debts and help me choose snowball or avalanche, and how much extra makes sense.');

  return server;
}

/** Stateless Streamable HTTP: a fresh server per request (no Durable Objects needed). */
export async function handleMcp(request: Request, env: McpEnv): Promise<Response> {
  const server = createServer(env);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}
