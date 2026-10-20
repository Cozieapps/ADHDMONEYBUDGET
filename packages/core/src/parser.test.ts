import { describe, expect, it } from 'vitest';
import { defaultCategories } from './factory';
import { parseQuickAdd } from './parser';
import { txn } from './test-fixtures';

const cats = defaultCategories(0);
const name = (id?: string) => cats.find((c) => c.id === id)?.name;

const cases: [string, number | undefined, string, string, string?][] = [
  // input, cents, type, category, merchant
  ['12 coffee', 1200, 'spend', 'Coffee & treats'],
  ['4.5 latte', 450, 'spend', 'Coffee & treats'],
  ['$3.80 coffee', 380, 'spend', 'Coffee & treats'],
  ['coffee 4.50', 450, 'spend', 'Coffee & treats'],
  ['40 target groceries', 4000, 'spend', 'Groceries'],
  ['23.40 lunch at Joe’s Diner', 2340, 'spend', 'Eating out', 'Joe’s Diner'],
  ['spent 23.40 on lunch with Sam', 2340, 'spend', 'Eating out'],
  ['+2100 paycheck', 210000, 'income', 'Paycheck'],
  ['2,100 salary', 210000, 'income', 'Paycheck'],
  ['got paid 450 tips', 45000, 'income', 'Side income'],
  ['refund 15 amazon', 1500, 'refund', 'Refunds'],
  ['60 gas', 6000, 'spend', 'Transport'],
  ['uber 18', 1800, 'spend', 'Transport'],
  ['15.49 netflix', 1549, 'spend', 'Subscriptions'],
  ['32 vet', 3200, 'spend', 'Pets'],
  ['nails 45', 4500, 'spend', 'Self-care'],
  ['electric bill 73', 7300, 'spend', 'Bills & utilities'],
  ['cvs 12.99', 1299, 'spend', 'Health'],
  ['movie tickets 28', 2800, 'spend', 'Fun'],
  ['birthday gift 35', 3500, 'spend', 'Gifts'],
  ['9.5 lunch', 950, 'spend', 'Eating out'],
  ['ikea 120', 12000, 'spend', 'Home'],
  ['random thing 7', 700, 'spend', 'Other'],
  ['bought shoes for 64', 6400, 'spend', 'Shopping'],
  ['pizza', undefined, 'spend', 'Eating out'],
  ['12 boba tea', 1200, 'spend', 'Coffee & treats'],
];

describe('parseQuickAdd', () => {
  it.each(cases)('%s', (input, amount, type, category, merchant) => {
    const p = parseQuickAdd(input, cats);
    expect(p.amount).toBe(amount);
    expect(p.type).toBe(type);
    expect(name(p.categoryId)).toBe(category);
    if (merchant) expect(p.merchant).toBe(merchant);
  });

  it('collects #tags and keeps the note readable', () => {
    const p = parseQuickAdd('18 drinks with Ana #going-out #friday', cats);
    expect(p.tags).toEqual(['going-out', 'friday']);
    expect(p.note).toBe('Drinks with Ana');
  });

  it('prefers what you picked last time for the same merchant', () => {
    const history = [txn({ merchant: 'Joe Diner', categoryId: 'cat-spend-coffee-treats' })];
    expect(name(parseQuickAdd('9 at Joe Diner', cats, history).categoryId)).toBe('Coffee & treats');
  });
});
