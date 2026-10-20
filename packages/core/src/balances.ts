import type { Cents } from './money';
import type { Account, Snapshot, Txn } from './types';

const SIGN: Record<Txn['type'], number> = { spend: -1, income: 1, refund: 1, transfer: -1 };

/** Signed effect of a transaction on its account. Transfers leave the account unless `inbound`. */
export function txnEffect(txn: Txn): number {
  return (txn.type === 'transfer' && txn.inbound ? 1 : SIGN[txn.type]) * txn.amount;
}

/**
 * Current balance: the last confirmed balance plus everything logged after that
 * check for that day or later. A purchase from yesterday logged after this
 * morning's check is already inside the confirmed number, so it is not counted twice.
 */
export function currentBalance(account: Account, txns: readonly Txn[], defaultAccountId?: string): Cents {
  let balance = account.balance as number;
  for (const txn of txns) {
    if (txn.deletedAt) continue;
    const accountId = txn.accountId ?? defaultAccountId;
    if (accountId !== account.id) continue;
    if (txn.createdAt > account.checkedAt && txn.date >= account.checkedOn) balance += txnEffect(txn);
  }
  return balance as Cents;
}

/** Where transactions without an account land: the first spendable checking account. */
export function defaultAccountId(accounts: readonly Account[]): string | undefined {
  const live = accounts.filter((a) => !a.deletedAt);
  return (live.find((a) => a.type === 'checking' && a.spendable) ?? live.find((a) => a.spendable) ?? live[0])?.id;
}

export function spendableBalance(snapshot: Snapshot): Cents {
  const fallback = defaultAccountId(snapshot.accounts);
  return snapshot.accounts
    .filter((a) => !a.deletedAt && a.spendable)
    .reduce((sum, a) => sum + currentBalance(a, snapshot.txns, fallback), 0) as Cents;
}

/** Most recent balance check across accounts, or undefined if none. */
export function lastCheckedAt(accounts: readonly Account[]): number | undefined {
  const times = accounts.filter((a) => !a.deletedAt).map((a) => a.checkedAt);
  return times.length ? Math.max(...times) : undefined;
}
