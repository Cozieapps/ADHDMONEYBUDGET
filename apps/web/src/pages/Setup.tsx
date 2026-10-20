import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  LockKeyhole,
  Sprout,
} from "lucide-react";
import { cents, meta, defaultSettings, type Frequency } from "@sori/core";
import { useData } from "../data/data-context";
import { save } from "../data/repo";
import { Flower } from "../components/shared";

export function Setup() {
  const { snapshot, today } = useData();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [balance, setBalance] = useState("");
  const [buffer, setBuffer] = useState("100");
  const [payday, setPayday] = useState("");
  const [pay, setPay] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("biweekly");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function next(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (step === 0) return setStep(1);
    if (step === 1) return setStep(2);
    const balanceCents = Math.round(Number(balance) * 100);
    const bufferCents = Math.round(Number(buffer) * 100);
    if (
      !Number.isSafeInteger(balanceCents) ||
      !Number.isSafeInteger(bufferCents) ||
      bufferCents < 0
    )
      return setError("Check your balance and buffer amounts.");
    if ((payday && !pay) || (pay && !payday))
      return setError("Add both a payday and its amount, or leave both blank.");
    setBusy(true);
    try {
      const account = {
        ...meta(),
        name: "Everyday account",
        type: "checking" as const,
        balance: cents(balanceCents),
        checkedAt: Date.now(),
        checkedOn: today,
        spendable: true,
      };
      await save(
        { kind: "account", record: account },
        {
          kind: "settings",
          record: {
            ...defaultSettings(),
            ...snapshot.settings,
            name: name.trim(),
            currency,
            buffer: cents(bufferCents),
            setupDone: true,
            setupStep: 99,
            sounds: false,
            demo: false,
          },
        },
        ...(payday && Number(pay) > 0
          ? [
              {
                kind: "repeat" as const,
                record: {
                  ...meta(),
                  name: "Payday",
                  kind: "income" as const,
                  amount: cents(Math.round(Number(pay) * 100)),
                  frequency,
                  anchor: payday,
                  isPaycheck: true,
                  accountId: account.id,
                  autopay: false,
                  remindDaysBefore: 1,
                  paid: [],
                  active: true,
                },
              },
            ]
          : []),
      );
    } catch {
      setError(
        "Could not save your setup. Check device storage and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="setup-layout">
      <div className="setup-story">
        <a className="brand" href="#/">
          <Flower size={44} />
          <span>
            sori<span className="brand-dot">.</span>
            <small>MONEY, WITH A LITTLE KINDNESS</small>
          </span>
        </a>
        <div className="setup-story-main">
          <span className="eyebrow">A FRESH START, ON YOUR TERMS</span>
          <h1>
            Less mental load.
            <br />
            More room
            <br />
            to <em>breathe.</em>
          </h1>
          <p>
            Your money doesn’t need a perfect plan.
            <br />
            Just a little space to make sense of it.
          </p>
          <div className="story-flower">
            <Flower size={230} />
            <span className="petal-note">
              small steps
              <br />
              still count.
            </span>
          </div>
        </div>
        <p className="story-footer">
          <LockKeyhole size={15} /> Private by default. No bank connection
          needed.
        </p>
      </div>
      <div className="setup-form-side">
        <div className="setup-progress" aria-label={`Step ${step + 1} of 3`}>
          {["You", "Your starting point", "A little breathing room"].map(
            (s, i) => (
              <span key={s} className={i <= step ? "active" : ""}>
                {i < step ? <Check size={14} /> : i + 1}
                <small>{s}</small>
              </span>
            ),
          )}
        </div>
        <form onSubmit={(e) => void next(e)} className="setup-form stack">
          <span className="eyebrow">LET’S TAKE THIS ONE STEP AT A TIME</span>
          <h2>
            {step === 0
              ? "Hi, I’m Sori."
              : step === 1
                ? "Where are we starting?"
                : "Protect a little peace."}
          </h2>
          <p className="muted">
            {step === 0
              ? "A gentle place for your money. What would you like me to call you?"
              : step === 1
                ? "An estimate is okay. You can check and update this whenever you like."
                : "A buffer keeps a little money out of your daily spending. You choose what feels right."}
          </p>
          {step === 0 ? (
            <>
              <label className="field">
                Your first name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What should I call you?"
                  maxLength={40}
                  autoFocus
                  required
                />
              </label>
              <label className="field">
                Your currency
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {[
                    "USD",
                    "CAD",
                    "GBP",
                    "EUR",
                    "AUD",
                    "NZD",
                    "INR",
                    "PHP",
                    "ZAR",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <div className="soft-note">
                <Sprout size={21} />
                <p>
                  No catching up. No importing the past.
                  <br />
                  <strong>We’re starting right here.</strong>
                </p>
              </div>
            </>
          ) : step === 1 ? (
            <>
              <label className="field">
                Available balance ({currency})
                <input
                  type="number"
                  step="0.01"
                  min="-1000000"
                  max="1000000"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  placeholder="0.00"
                  required
                  autoFocus
                />
              </label>
              <p className="fine-print">
                Use your current available balance. Add other accounts later in
                Settings.
              </p>
              <div className="form-grid">
                <label className="field">
                  Next payday (optional)
                  <input
                    type="date"
                    value={payday}
                    min={today}
                    onChange={(e) => setPayday(e.target.value)}
                  />
                </label>
                <label className="field">
                  Take-home pay ({currency})
                  <input
                    type="number"
                    min="0.01"
                    max="1000000"
                    step="0.01"
                    value={pay}
                    onChange={(e) => setPay(e.target.value)}
                    placeholder="Optional"
                  />
                </label>
              </div>
              <label className="field">
                Pay frequency
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as Frequency)}
                >
                  <option value="weekly">Every week</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Every month</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="field">
                My safety buffer ({currency})
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  value={buffer}
                  onChange={(e) => setBuffer(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <div className="amount-shortcuts">
                {["0", "50", "100", "250"].map((n) => (
                  <button
                    type="button"
                    className={`btn ${buffer === n ? "" : "secondary"} small`}
                    key={n}
                    onClick={() => setBuffer(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="soft-note">
                <LockKeyhole size={22} />
                <p>
                  Your budget stays on this device. Cloud sync and AI are{" "}
                  <strong>your choice</strong>, whenever you’re ready.
                </p>
              </div>
              <p className="muted">
                Next, we’ll make room for bills, goals and the things that make
                your life yours.
              </p>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="setup-actions">
            {step > 0 && (
              <button
                className="btn ghost"
                type="button"
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={17} /> Back
              </button>
            )}
            <button className="btn" disabled={busy}>
              {busy
                ? "Making a little space…"
                : step === 2
                  ? "Meet my money"
                  : "A little further"}
              <ArrowRight size={17} />
            </button>
          </div>
          <a className="preview-link" href="?preview=1#/">
            Just looking? Explore a sample budget first <ArrowRight size={14} />
          </a>
        </form>
        <p className="setup-foot">
          A calmer relationship with money, one day at a time.
        </p>
      </div>
    </main>
  );
}
