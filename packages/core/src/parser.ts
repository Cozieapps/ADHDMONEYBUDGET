import type { Cents } from './money';
import type { Category, Txn, TxnType } from './types';

export interface ParsedEntry {
  amount?: Cents;
  type: Exclude<TxnType, 'transfer'>;
  merchant?: string;
  note: string;
  tags: string[];
  categoryId?: string;
}

const AMOUNT = /(?:^|[\s+])\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\b/;
const INCOME_WORDS = /\b(paycheck|salary|got paid|payday|income|paid me|wages|bonus|tips)\b/i;
const REFUND_WORDS = /\b(refund|refunded|returned|cashback)\b/i;
const FILLER = /\b(i|just|spent|spend|paid|pay|bought|buy|got|for|on|a|an|the|dollars?|bucks|usd|today|some)\b/gi;

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '').trim();
}

function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

function titleCase(text: string): string {
  return text.replace(/(^|\s)(\p{L})/gu, (_, space: string, ch: string) => space + ch.toUpperCase());
}

/** Parses quick-log text like "12 coffee", "40 target groceries", "+2100 paycheck", "23.40 lunch at Joe's #work". */
export function parseQuickAdd(input: string, categories: readonly Category[] = [], history: readonly Txn[] = []): ParsedEntry {
  let text = ` ${input.trim()} `;
  const tags = [...text.matchAll(/#([\p{L}\d][\p{L}\d_-]*)/gu)].map((m) => m[1]!.toLowerCase());
  text = text.replace(/#[\p{L}\d][\p{L}\d_-]*/gu, ' ');

  let type: ParsedEntry['type'] = 'spend';
  if (/^\s*\+/.test(text) || INCOME_WORDS.test(text)) type = 'income';
  if (REFUND_WORDS.test(text)) type = 'refund';

  let amount: Cents | undefined;
  const match = AMOUNT.exec(text);
  if (match) {
    const whole = Number(match[1]!.replace(/,/g, ''));
    const fraction = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
    amount = (whole * 100 + fraction) as Cents;
    text = text.slice(0, match.index) + ' ' + text.slice(match.index + match[0].length);
  }
  text = text.replace(/^\s*\+/, ' ');

  let merchant: string | undefined;
  const at = /\b(?:at|from|@)\s+(.+)$/i.exec(text);
  if (at) {
    merchant = titleCase(tidy(at[1]!.replace(FILLER, ' ')));
    text = text.slice(0, at.index);
  }

  const note = capitalize(tidy(text.replace(FILLER, ' ')));
  const entry: ParsedEntry = { type, note, tags };
  if (amount !== undefined) entry.amount = amount;
  if (merchant) entry.merchant = merchant;
  const categoryId = guessCategory(`${note} ${merchant ?? ''}`, type, categories, history);
  if (categoryId) entry.categoryId = categoryId;
  return entry;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\d ]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** History first (what you chose last time for this name), then keywords, then "Other". */
export function guessCategory(
  text: string,
  type: ParsedEntry['type'],
  categories: readonly Category[],
  history: readonly Txn[] = [],
): string | undefined {
  const words = normalize(text);
  if (!words) return undefined;
  const kind = type === 'income' ? 'income' : 'spend';
  const live = categories.filter((c) => !c.deletedAt && c.kind === kind);

  if (type !== 'refund') {
    for (let i = history.length - 1; i >= 0; i--) {
      const t = history[i]!;
      if (t.deletedAt || !t.categoryId) continue;
      const label = normalize(`${t.merchant ?? ''} ${t.note ?? ''}`);
      if (label && (label === words || (t.merchant && words.includes(normalize(t.merchant))))) {
        if (live.some((c) => c.id === t.categoryId)) return t.categoryId;
      }
    }
  } else {
    return categories.find((c) => !c.deletedAt && c.kind === 'income' && c.name === 'Refunds')?.id;
  }

  let best: { id: string; length: number } | undefined;
  for (const c of live) {
    for (const keyword of [c.name.toLowerCase(), ...c.keywords]) {
      const k = normalize(keyword);
      if (!k) continue;
      if (new RegExp(`(^| )${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?( |$)`).test(words) && (!best || k.length > best.length)) {
        best = { id: c.id, length: k.length };
      }
    }
  }
  if (best) return best.id;
  return live.find((c) => c.name === (kind === 'income' ? 'Other income' : 'Other'))?.id;
}
