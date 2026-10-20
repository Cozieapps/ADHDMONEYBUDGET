import { cents } from './money';
import type { Category, RecordMeta, Settings, Source, Tone } from './types';

export function newId(): string {
  return crypto.randomUUID();
}

export function meta(source: Source = 'app', now = Date.now()): RecordMeta {
  return { id: newId(), updatedAt: now, source };
}

export const SETTINGS_ID = 'settings';

// Records that several devices (and Claude) might create for the same thing get
// a fixed id, so sync merges them instead of keeping duplicates.

/** The single envelope for a category. */
export function budgetId(categoryId: string): string {
  return `budget:${categoryId}`;
}

/** The transaction recording that a repeat (bill, paycheck…) happened on a date. */
export function repeatTxnId(repeatId: string, date: string): string {
  return `paid:${repeatId}:${date}`;
}

export function defaultSettings(now = Date.now()): Settings {
  return {
    id: SETTINGS_ID,
    updatedAt: now,
    source: 'app',
    name: '',
    currency: 'USD',
    locale: 'en-US',
    buffer: cents(20000),
    setupDone: false,
    setupStep: 0,
    sounds: false,
    haptics: true,
    dailyLine: true,
    reminders: {
      bills: true,
      payday: true,
      checkIn: true,
      pace: true,
      waitList: true,
      checkInTime: '19:30',
      quietStart: '21:30',
      quietEnd: '08:00',
    },
    debtStrategy: 'avalanche',
    debtExtra: cents(0),
    debtOrder: [],
  };
}

type CategorySeed = [name: string, emoji: string, tone: Tone, keywords: string[]];

const SPEND: CategorySeed[] = [
  ['Groceries', '🛒', 'mint', ['grocery', 'groceries', 'supermarket', 'aldi', 'kroger', 'safeway', 'trader joe', 'whole foods', 'costco', 'walmart', 'publix', 'heb', 'food']],
  ['Eating out', '🍜', 'peach', ['lunch', 'dinner', 'breakfast', 'brunch', 'restaurant', 'takeout', 'pizza', 'sushi', 'burger', 'doordash', 'uber eats', 'grubhub', 'chipotle', 'mcdonald', 'taco']],
  ['Coffee & treats', '☕', 'butter', ['coffee', 'latte', 'starbucks', 'dunkin', 'cafe', 'boba', 'tea', 'snack', 'treat', 'dessert', 'ice cream', 'donut', 'bakery']],
  ['Transport', '🚌', 'sky', ['gas', 'fuel', 'uber', 'lyft', 'bus', 'train', 'metro', 'parking', 'toll', 'taxi', 'car wash']],
  ['Home', '🏠', 'lavender', ['rent', 'mortgage', 'furniture', 'ikea', 'home depot', 'lowes', 'cleaning', 'decor']],
  ['Bills & utilities', '💡', 'sky', ['electric', 'electricity', 'water', 'internet', 'wifi', 'phone', 'utility', 'insurance', 'gas bill']],
  ['Subscriptions', '📺', 'lavender', ['netflix', 'spotify', 'hulu', 'disney', 'youtube', 'apple', 'icloud', 'prime', 'subscription', 'patreon', 'max', 'audible', 'gym']],
  ['Health', '💊', 'mint', ['pharmacy', 'cvs', 'walgreens', 'doctor', 'dentist', 'therapy', 'meds', 'medicine', 'vitamins', 'copay', 'prescription']],
  ['Shopping', '🛍️', 'pink', ['amazon', 'target', 'clothes', 'shoes', 'shein', 'etsy', 'mall', 'sephora', 'ulta', 'shopping']],
  ['Fun', '🎉', 'pink', ['movie', 'movies', 'concert', 'game', 'games', 'steam', 'bar', 'drinks', 'books', 'hobby', 'tickets', 'party']],
  ['Self-care', '💅', 'peach', ['nails', 'hair', 'salon', 'spa', 'massage', 'skincare', 'makeup', 'haircut']],
  ['Pets', '🐾', 'butter', ['pet', 'vet', 'dog', 'cat', 'chewy', 'petco', 'petsmart']],
  ['Gifts', '🎁', 'pink', ['gift', 'gifts', 'birthday', 'present', 'flowers', 'donation']],
  ['Kids', '🧸', 'butter', ['kids', 'school', 'daycare', 'toys', 'babysitter']],
  ['Other', '✨', 'lavender', []],
];

const INCOME: CategorySeed[] = [
  ['Paycheck', '💼', 'mint', ['paycheck', 'salary', 'pay', 'wages', 'payroll']],
  ['Side income', '💸', 'mint', ['side', 'freelance', 'gig', 'etsy sale', 'tips', 'sold']],
  ['Refunds', '↩️', 'sky', ['refund', 'return', 'cashback', 'rebate']],
  ['Other income', '🌱', 'butter', ['gift money', 'interest', 'bonus', 'tax refund']],
];

export const OTHER_CATEGORY_NAME = 'Other';

export function defaultCategories(now = Date.now()): Category[] {
  const make = (kind: Category['kind']) => ([name, emoji, tone, keywords]: CategorySeed, order: number): Category => ({
    id: `cat-${kind}-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
    updatedAt: now,
    source: 'app',
    name,
    emoji,
    tone,
    kind,
    keywords,
    order,
  });
  return [...SPEND.map(make('spend')), ...INCOME.map(make('income'))];
}
