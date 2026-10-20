import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Snapshot } from '@sori/core';
import { askCoach, coachSummary } from './ai';
import { authenticatedCoachRequest, isConnected } from './sync';

vi.mock('./sync', () => ({ authenticatedCoachRequest: vi.fn(), isConnected: vi.fn(() => true) }));
vi.mock('./config', () => ({ apiUrl: () => 'https://budget.example.test' }));

const snapshot: Snapshot = {
  settings: defaultSettings(), accounts: [], categories: [], txns: [], repeats: [],
  budgets: [], goals: [], debts: [], waits: [], wins: [],
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(isConnected).mockReturnValue(true);
  vi.mocked(authenticatedCoachRequest).mockReset();
  vi.mocked(authenticatedCoachRequest).mockImplementation(async () => Response.json({ reply: 'A little step is enough.' }));
});

describe('cloud coach client', () => {
  it('sends only the numeric summary, not names or the full ledger', () => {
    const s = { ...snapshot, settings: { ...snapshot.settings, name: 'Private name' } };
    expect(coachSummary(s)).toMatchObject({ currency: 'USD', balance: 0, paydayKnown: false });
    expect(JSON.stringify(coachSummary(s))).not.toContain('Private name');
    expect(coachSummary(s)).not.toHaveProperty('txns');
    expect(coachSummary(s)).not.toHaveProperty('accounts');
  });

  it('returns text without interpreting model instructions as actions', async () => {
    vi.mocked(authenticatedCoachRequest).mockResolvedValueOnce(Response.json({ reply: '<script>doSomething()</script>' }));
    expect(await askCoach('Help me make a plan', snapshot)).toBe('<script>doSomething()</script>');
    expect(authenticatedCoachRequest).toHaveBeenCalledWith({ message: 'Help me make a plan', summary: coachSummary(snapshot) });
  });

  it('rejects invalid questions and disconnected devices without a request', async () => {
    await expect(askCoach(' ', snapshot)).rejects.toThrow('between 1 and 600');
    await expect(askCoach('a'.repeat(601), snapshot)).rejects.toThrow('between 1 and 600');
    vi.mocked(isConnected).mockReturnValue(false);
    await expect(askCoach('Hello', snapshot)).rejects.toThrow('Connect your Sori server');
    expect(authenticatedCoachRequest).not.toHaveBeenCalled();
  });

  it('limits local attempts before an eleventh request', async () => {
    for (let i = 0; i < 10; i++) await askCoach('What is one step?', snapshot);
    await expect(askCoach('One more', snapshot)).rejects.toThrow('10 cloud chats');
    expect(authenticatedCoachRequest).toHaveBeenCalledTimes(10);
  });

  it('surfaces server quota and disabled AI without exposing arbitrary server text', async () => {
    vi.mocked(authenticatedCoachRequest).mockResolvedValueOnce(Response.json({ error: 'daily_limit', message: 'untrusted internal secret' }, { status: 429 }));
    await expect(askCoach('Help', snapshot)).rejects.toThrow('10 cloud chats');
    vi.mocked(authenticatedCoachRequest).mockResolvedValueOnce(Response.json({ error: 'ai_not_configured' }, { status: 503 }));
    await expect(askCoach('Help', snapshot)).rejects.toThrow('off on your server');
  });

  it('validates external response shape before returning it', async () => {
    vi.mocked(authenticatedCoachRequest).mockResolvedValueOnce(Response.json({ reply: { tool: 'move_money' } }));
    await expect(askCoach('Help', snapshot)).rejects.toThrow('unusable reply');
    vi.mocked(authenticatedCoachRequest).mockResolvedValueOnce(Response.json({ reply: 'x'.repeat(4_001) }));
    await expect(askCoach('Help', snapshot)).rejects.toThrow('unusable reply');
  });
});
