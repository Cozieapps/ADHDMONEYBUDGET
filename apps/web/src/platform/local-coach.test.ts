import { describe, expect, it } from "vitest";
import {
  buildDemo,
  defaultSettings,
  defaultCategories,
  type Snapshot,
} from "@sori/core";
import { localReply } from "./local-coach";
const empty: Snapshot = {
  settings: defaultSettings(),
  categories: defaultCategories(),
  accounts: [],
  txns: [],
  repeats: [],
  budgets: [],
  goals: [],
  debts: [],
  waits: [],
  wins: [],
};
describe("grounded local coaching", () => {
  it("does not invent a payday or spending history for a new budget", () => {
    const reply = localReply("How can I improve?", empty, "2026-10-20");
    expect(reply).toMatch(/payday|account|starting/i);
    expect(reply).not.toMatch(/you spent|always spend|your habit is/i);
  });
  it("explains an affordability question with calculated values and no hidden write", () => {
    const s = buildDemo("2026-10-20");
    const before = JSON.stringify(s);
    expect(localReply("Can I afford 40 shoes?", s, "2026-10-20")).toMatch(
      /40\.00|40|today|payday/,
    );
    expect(JSON.stringify(s)).toBe(before);
  });
  it("suggests a checkable draft instead of claiming a transaction was logged", () => {
    expect(localReply("log 12 coffee", empty, "2026-10-20")).toMatch(
      /review|save|check/i,
    );
    expect(empty.txns).toHaveLength(0);
  });
});
