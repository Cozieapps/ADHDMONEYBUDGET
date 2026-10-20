import { useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Sparkles } from "lucide-react";
import { cents, parseQuickAdd } from "@sori/core";
import { useData } from "../data/data-context";
import { logTxn } from "../data/actions";
import { playCue, buzz } from "../platform/feedback";
import { Modal, useToast } from "./shared";

export function Log({
  onClose,
  initial = "",
}: {
  onClose: () => void;
  initial?: string;
}) {
  const { snapshot, today } = useData();
  const parsed = parseQuickAdd(initial, snapshot.categories, snapshot.txns);
  const [type, setType] = useState<"spend" | "income" | "refund">(parsed.type);
  const [quick, setQuick] = useState(initial);
  const [amount, setAmount] = useState(
    parsed.amount ? (parsed.amount / 100).toFixed(2) : "",
  );
  const [note, setNote] = useState(parsed.note);
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState(parsed.categoryId ?? "");
  const [account, setAccount] = useState(
    snapshot.accounts.find((a) => a.spendable)?.id ??
      snapshot.accounts[0]?.id ??
      "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const categories = snapshot.categories.filter(
    (c) => c.kind === (type === "income" ? "income" : "spend"),
  );
  function readQuick(text: string) {
    setQuick(text);
    const p = parseQuickAdd(text, snapshot.categories, snapshot.txns);
    if (p.amount) setAmount((p.amount / 100).toFixed(2));
    setNote(p.note);
    setType(p.type);
    setCategory(p.categoryId ?? "");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const value = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(value) || value <= 0 || value > 100_000_000)
      return setError("Choose an amount between 0.01 and 1,000,000.");
    if (!account) return setError("Add an account in Settings first.");
    setBusy(true);
    try {
      const result = await logTxn({
        amount: cents(value),
        type,
        date,
        note: note.trim(),
        tags: parseQuickAdd(quick).tags,
        categoryId: category || categories.at(-1)?.id,
        accountId: account,
      });
      playCue("log", snapshot.settings.sounds);
      buzz("log", snapshot.settings.haptics);
      toast({
        message:
          type === "income"
            ? "Money in. A little more breathing room."
            : "Logged. One less thing to hold in your head.",
        action: result.undo,
      });
      onClose();
    } catch {
      setError("Could not save on this device. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="A little money check-in" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="stack">
        <div className="segmented">
          <button
            type="button"
            className={type === "spend" ? "selected" : ""}
            onClick={() => {
              setType("spend");
              setCategory("");
            }}
          >
            <ArrowUpRight size={16} /> Money out
          </button>
          <button
            type="button"
            className={type === "income" ? "selected" : ""}
            onClick={() => {
              setType("income");
              setCategory("");
            }}
          >
            <ArrowDownLeft size={16} /> Money in
          </button>
          <button
            type="button"
            className={type === "refund" ? "selected" : ""}
            onClick={() => {
              setType("refund");
              setCategory("");
            }}
          >
            Refund
          </button>
        </div>
        <label className="field quick-entry">
          <span>
            <Sparkles size={15} /> Write it your way
          </span>
          <input
            value={quick}
            onChange={(e) => readQuick(e.target.value)}
            placeholder="12.50 coffee at Lily’s #work"
            autoFocus
            maxLength={300}
          />
          <small>
            Amount and category filled in for you. Check them below.
          </small>
        </label>
        <label className="field">
          <span>Amount ({snapshot.settings.currency})</span>
          <input
            className="amount-input"
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0.01"
            max="1000000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <div className="amount-shortcuts">
          {[5, 10, 20, 50].map((n) => (
            <button
              className="btn secondary small"
              type="button"
              key={n}
              onClick={() => setAmount((Number(amount || 0) + n).toFixed(2))}
            >
              +{n}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label className="field">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Account
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
            >
              <option value="">Choose an account</option>
              {snapshot.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            What was it for?
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={150}
              placeholder="A little detail (optional)"
            />
          </label>
          <label className="field">
            When
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn full" disabled={busy}>
          {busy
            ? "Saving…"
            : type === "income"
              ? "Save money in"
              : "Save money out"}
        </button>
        <p className="fine-print">
          Saved on your device. Always yours to undo.
        </p>
      </form>
    </Modal>
  );
}
