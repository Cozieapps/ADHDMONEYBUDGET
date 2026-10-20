import type { Cents } from './money';

/** Calendar date in the owner's local time, `YYYY-MM-DD`. */
export type ISODate = string;

export type Source = 'app' | 'claude';
export type Tone = 'pink' | 'lavender' | 'mint' | 'peach' | 'butter' | 'sky';

export const RECORD_KINDS = [
  'settings',
  'account',
  'category',
  'txn',
  'repeat',
  'budget',
  'goal',
  'debt',
  'wait',
  'win',
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/** Fields every synced record carries. */
export interface RecordMeta {
  id: string;
  updatedAt: number;
  deletedAt?: number | null;
  source: Source;
}

export type AccountType = 'checking' | 'savings' | 'cash' | 'credit';

export interface Account extends RecordMeta {
  name: string;
  type: AccountType;
  /** Balance the owner confirmed at `checkedAt`. Credit cards store what is owed as a negative number. */
  balance: Cents;
  checkedAt: number;
  checkedOn: ISODate;
  /** Included in "money in your accounts" for safe-to-spend. */
  spendable: boolean;
}

export type TxnType = 'spend' | 'income' | 'refund' | 'transfer';

export interface Txn extends RecordMeta {
  date: ISODate;
  /** Always positive; `type` gives the direction. */
  amount: Cents;
  type: TxnType;
  categoryId?: string;
  accountId?: string;
  merchant?: string;
  note?: string;
  tags: string[];
  createdAt: number;
  repeatId?: string;
  /** Transfers into a savings goal or toward a debt. */
  goalId?: string;
  debtId?: string;
  /** For transfers: money coming back into the account (e.g. taken out of a goal). */
  inbound?: boolean;
}

export interface Category extends RecordMeta {
  name: string;
  emoji: string;
  tone: Tone;
  kind: 'spend' | 'income';
  keywords: string[];
  order: number;
}

export type Frequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'yearly';
export type RepeatKind = 'income' | 'bill' | 'subscription' | 'debt' | 'saving';

export interface Repeat extends RecordMeta {
  name: string;
  kind: RepeatKind;
  amount: Cents;
  frequency: Frequency;
  /** First (or next) occurrence; nothing is generated before it. */
  anchor: ISODate;
  /** For semimonthly: the two days of the month, e.g. [1, 15]. 31 means "last day". */
  days?: [number, number];
  endsOn?: ISODate;
  categoryId?: string;
  accountId?: string;
  /** Income that defines the pay period. */
  isPaycheck?: boolean;
  autopay: boolean;
  remindDaysBefore: number;
  /** Occurrence dates the owner ticked off. */
  paid: ISODate[];
  active: boolean;
}

export interface Budget extends RecordMeta {
  categoryId: string;
  /** Planned spending per calendar month. */
  monthly: Cents;
}

export interface Goal extends RecordMeta {
  name: string;
  emoji: string;
  tone: Tone;
  kind: 'goal' | 'emergency';
  target: Cents;
  saved: Cents;
  /** Amount put by each month. */
  monthly: Cents;
  targetDate?: ISODate;
  /** Date of the most recent contribution; used to know if this pay period's goal money is set aside. */
  lastAddedOn?: ISODate;
  archived?: boolean;
}

export interface Debt extends RecordMeta {
  name: string;
  balance: Cents;
  /** Annual percentage rate, e.g. 24.99. */
  apr: number;
  minimum: Cents;
  dueDay: number;
  /** Months (`YYYY-MM`) whose payment is done. */
  paidMonths: string[];
}

export interface WaitItem extends RecordMeta {
  name: string;
  amount: Cents;
  link?: string;
  addedAt: number;
  decideAfter: number;
  status: 'waiting' | 'bought' | 'skipped';
  decidedAt?: number;
}

/** One record per day for the Small wins checklist. id = the date. */
export interface WinDay extends RecordMeta {
  date: ISODate;
  nothingToLog?: boolean;
  checkedBalance?: boolean;
  tickedBills?: boolean;
}

export type DebtStrategy = 'snowball' | 'avalanche' | 'custom';

export interface ReminderPrefs {
  bills: boolean;
  payday: boolean;
  checkIn: boolean;
  pace: boolean;
  waitList: boolean;
  /** `HH:MM` local. */
  checkInTime: string;
  quietStart: string;
  quietEnd: string;
}

export interface Settings extends RecordMeta {
  name: string;
  currency: string;
  locale: string;
  buffer: Cents;
  setupDone: boolean;
  setupStep: number;
  sounds: boolean;
  haptics: boolean;
  dailyLine: boolean;
  reminders: ReminderPrefs;
  debtStrategy: DebtStrategy;
  debtExtra: Cents;
  debtOrder: string[];
  challenge52?: { startedOn: ISODate; done: number[]; reverse: boolean };
  /** IANA zone (e.g. America/Chicago) so the server knows what "today" is for the owner. */
  timeZone?: string;
  demo?: boolean;
}

export interface Snapshot {
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  txns: Txn[];
  repeats: Repeat[];
  budgets: Budget[];
  goals: Goal[];
  debts: Debt[];
  waits: WaitItem[];
  wins: WinDay[];
}

export type RecordOf<K extends RecordKind> = K extends 'settings'
  ? Settings
  : K extends 'account'
    ? Account
    : K extends 'category'
      ? Category
      : K extends 'txn'
        ? Txn
        : K extends 'repeat'
          ? Repeat
          : K extends 'budget'
            ? Budget
            : K extends 'goal'
              ? Goal
              : K extends 'debt'
                ? Debt
                : K extends 'wait'
                  ? WaitItem
                  : WinDay;
