import {
  safeToSpend,
  forecast,
  canIAfford,
  nudges,
  parseQuickAdd,
  formatCents,
  type Snapshot,
} from "@sori/core";

export function localReply(
  message: string,
  snapshot: Snapshot,
  today: string,
): string {
  const safe = safeToSpend(snapshot, today);
  const money = (n: number) =>
    formatCents(
      n as Parameters<typeof formatCents>[0],
      snapshot.settings.currency,
      snapshot.settings.locale,
    );
  const question = message.toLowerCase();
  if (/\b(log|spent|bought|paid for)\b/.test(question))
    return "Let’s take that off your mind. Choose “Review a money entry” below, check the amount and category, then save. I won’t change your budget without you.";
  if (!snapshot.accounts.length)
    return "A fresh start is a perfectly good starting point. Add an account balance in Settings, then your next payday in Calendar. We can build the rest one small step at a time.";
  if (/afford|buy|purchase|shoes/.test(question)) {
    const entry = parseQuickAdd(message);
    if (!entry.amount)
      return "What does it cost? Try “Can I afford 40 for shoes?” and I’ll compare it with your plan.";
    const a = canIAfford(snapshot, today, entry.amount);
    return `${money(entry.amount)} ${a.verdict === "yes" ? "fits within today’s estimate." : a.verdict === "stretch" ? "could fit before payday, but it means a gentler spending pace." : "would put pressure on the money set aside before payday."} Your daily amount afterwards would be about ${money(a.perDayAfter)}.${a.shortBy ? ` Your plan would be short by ${money(a.shortBy)}.` : ""} If it isn’t urgent, your 48-hour pause list gives you room to decide. This is an estimate based on what you’ve logged.`;
  }
  if (/overwhelm|anxious|stress|behind|shame|bad|tired/.test(question))
    return "You don’t need to solve the whole month today. Try one tiny thing: check your current available balance, then log just the last expense you remember. A missed day isn’t a failed budget. If the numbers feel heavy, the simple view can make a little room.";
  if (/debt|pay off|interest/.test(question)) {
    if (!snapshot.debts.length)
      return "Add a debt balance, minimum payment and APR in Debt. We’ll compare the smallest-balance-first and highest-interest-first approaches. Pick a pace that leaves room for everyday life.";
    return `You’re tracking ${snapshot.debts.length} ${snapshot.debts.length === 1 ? "debt" : "debts"}, totalling ${money(snapshot.debts.reduce((n, d) => n + d.balance, 0))}. The avalanche approach targets high interest first; snowball starts with a smaller balance for a quicker win. In Debt, move the extra-payment slider to compare the actual timelines. Your safety buffer still matters.`;
  }
  if (/forecast|next month|coming|future/.test(question)) {
    const f = forecast(snapshot, today, 30);
    return `In the next 30 days, your estimated lowest balance is ${money(f.lowest.balance)} on ${f.lowest.date}. This uses your scheduled income, bills and ${f.learnedDailySpend ? "recent average" : "planned"} everyday spending of ${money(f.dailySpend)} a day. Forecast lets you test a purchase before making it. Estimates improve when your balances and bills are current.`;
  }
  if (/save|goal|saving/.test(question))
    return snapshot.goals.length
      ? `Your goals have ${money(snapshot.goals.reduce((n, g) => n + g.saved, 0))} set aside so far. A smaller, repeatable contribution can be kinder than an ambitious one you can’t sustain. Open Goals to add a little or change the monthly pace; money moved into a goal is accounted for in your spending estimate.`
      : "Give one thing you care about a name in Goals. Start with an amount that feels easy, even a few coins. A safety-net goal can be a good first place to build a little breathing room.";
  const n = nudges(snapshot, today)[0];
  return `Today’s estimate is ${money(safe.leftToday)}${safe.paydayKnown ? `, with ${money(safe.untilPayday)} to last until ${safe.nextPayday}` : ". Adding your next payday will make it clearer"}. ${n ? `${n.title}. ${n.body}` : "One small check-in is enough for today."} ${snapshot.txns.length >= 10 ? "Your insights use your own logged history, so they can spot repeat purchases and category pace." : "I’ll need a little more logged history before suggesting patterns."}`;
}

export function budgetContext(snapshot: Snapshot, today: string): string {
  const safe = safeToSpend(snapshot, today);
  const f = forecast(snapshot, today, 30);
  return `Help me plan gently, without shame. These are manually tracked estimates, not bank data. Currency: ${snapshot.settings.currency}. As of ${today}: available balance ${(safe.accounts / 100).toFixed(2)}; safe today ${(safe.leftToday / 100).toFixed(2)}; bills before payday ${(safe.bills / 100).toFixed(2)}; debt minimums ${(safe.debts / 100).toFixed(2)}; buffer ${(safe.buffer / 100).toFixed(2)}; next payday ${safe.paydayKnown ? safe.nextPayday : "unknown"}; projected low ${(f.lowest.balance / 100).toFixed(2)} on ${f.lowest.date}. No account names or transaction details included. Explain assumptions and suggest one practical next step. Don’t claim to log or change records without a connected Sori tool.`;
}
