import { safeToSpend, today, type Snapshot } from '@sori/core';
import { authenticatedCoachRequest, isConnected } from './sync';
import { apiUrl } from './config';

/** Exact totals only: no account names, merchants, notes or full ledger leave the device. */
export function coachSummary(snapshot: Snapshot) {
  const date = today();
  const safe = safeToSpend(snapshot, date);
  const month = date.slice(0, 7);
  const txns = snapshot.txns.filter((t) => !t.deletedAt && t.date.startsWith(month) && t.date <= date);
  return {
    currency: snapshot.settings.currency,
    balance: safe.accounts,
    safeToday: safe.leftToday,
    billsBeforePayday: safe.bills + safe.debts,
    safetyBuffer: safe.buffer,
    daysToPayday: Math.min(400, safe.daysLeft),
    paydayKnown: safe.paydayKnown,
    spendingThisMonth: txns.reduce((n, t) => n + (t.type === 'spend' ? t.amount : t.type === 'refund' ? -t.amount : 0), 0),
    incomeThisMonth: txns.filter((t) => t.type === 'income').reduce((n, t) => n + t.amount, 0),
    goalsSaved: snapshot.goals.filter((g) => !g.deletedAt && !g.archived).reduce((n, g) => n + g.saved, 0),
    debtBalance: snapshot.debts.filter((d) => !d.deletedAt).reduce((n, d) => n + d.balance, 0),
  };
}

function reserveLocalAttempt(): void {
  if (!isConnected()) throw new Error('Connect your Sori server in Settings before using cloud AI.');
  const key = `sori.bloom.coach.attempts:${apiUrl()}:${new Date().toISOString().slice(0, 10)}`;
  const used = Number(localStorage.getItem(key) ?? 0);
  if (!Number.isSafeInteger(used) || used < 0 || used >= 10) {
    throw new Error('Your 10 cloud chats for today are used. Try local coaching until midnight UTC.');
  }
  // Reserve before the network call; unknown/failed attempts are not silently retried.
  localStorage.setItem(key, String(used + 1));
}

/** Call only after explicit cloud-AI opt-in. Replies are plain untrusted text, never actions. */
export async function askCoach(message: string, snapshot: Snapshot): Promise<string> {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 600) throw new Error('Write a question between 1 and 600 characters.');
  reserveLocalAttempt();
  const response = await authenticatedCoachRequest({ message: trimmed, summary: coachSummary(snapshot) });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body && typeof body === 'object' && 'error' in body ? body.error : undefined;
    const errors: Record<string, string> = {
      unauthorized: 'Reconnect your Sori server in Settings before using cloud AI.',
      ai_not_configured: 'Cloud AI is off on your server. Local coaching is available without a connection.',
      daily_limit: 'Your 10 cloud chats for today are used. Try local coaching until the daily reset at midnight UTC.',
      ai_unavailable: 'Cloud AI is unavailable or its free allowance is used. Try local coaching.',
      invalid_ai_response: 'Cloud AI returned an unusable reply. Try local coaching.',
    };
    throw new Error(typeof code === 'string' && errors[code] ? errors[code] : `Cloud AI could not answer (${response.status}). Try local coaching.`);
  }
  if (!body || typeof body !== 'object' || !('reply' in body) || typeof body.reply !== 'string' || !body.reply.trim() || body.reply.length > 4_000) {
    throw new Error('Cloud AI returned an unusable reply. Try local coaching.');
  }
  return body.reply;
}
