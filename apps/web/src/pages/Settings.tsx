import { useState, type FormEvent } from "react";
import { Capacitor } from "@capacitor/core";
import {
  Plus,
  Download,
  Upload,
  Cloud,
  LockKeyhole,
  Bell,
  Volume2,
  Check,
  Wallet,
  RefreshCw,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import {
  cents,
  meta,
  currentBalance,
  defaultAccountId,
  planReminders,
  type Account,
} from "@sori/core";
import { useData } from "../data/data-context";
import {
  checkBalances,
  updateSettings,
  saveRecord,
  exportJSON,
  exportCSV,
  importJSON,
} from "../data/actions";
import { connect, disconnect, syncNow, useSyncState } from "../platform/sync";
import { apiUrl, setApiUrl } from "../platform/config";
import {
  notificationPermission,
  scheduleTestNotification,
  applyReminders,
} from "../platform/notifications";
import { saveTextFile } from "../platform/files";
import { Modal, Money, useToast } from "../components/shared";

export function AccountForm({
  account,
  onClose,
}: {
  account?: Account;
  onClose: () => void;
}) {
  const { snapshot, today } = useData();
  const [name, setName] = useState(account?.name ?? "");
  const [balance, setBalance] = useState(
    account
      ? (
          currentBalance(
            account,
            snapshot.txns,
            defaultAccountId(snapshot.accounts),
          ) / 100
        ).toFixed(2)
      : "",
  );
  const [type, setType] = useState<Account["type"]>(
    account?.type ?? "checking",
  );
  const [spendable, setSpendable] = useState(account?.spendable ?? true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Math.round(Number(balance) * 100);
    if (!Number.isSafeInteger(n) || Math.abs(n) > 100_000_000)
      return setError("Check that balance amount.");
    setBusy(true);
    try {
      if (account)
        await checkBalances(
          [
            {
              account: { ...account, name: name.trim(), type, spendable },
              balance: cents(n),
            },
          ],
          today,
          snapshot,
        );
      else
        await saveRecord({
          kind: "account",
          record: {
            ...meta(),
            name: name.trim(),
            type,
            balance: cents(n),
            spendable,
            checkedAt: Date.now(),
            checkedOn: today,
          },
        });
      toast({
        message: account
          ? "Balance checked. A clearer little picture."
          : "Account added. A little more clarity.",
      });
      onClose();
    } catch {
      setError("Could not save this account. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={account ? "Check your balance" : "Add an account"}
      onClose={onClose}
    >
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <label className="field">
          Account name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            Account type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Account["type"])}
            >
              <option value="checking">Checking / current</option>
              <option value="savings">Savings</option>
              <option value="cash">Cash</option>
              <option value="credit">Credit card</option>
            </select>
          </label>
          <label className="field">
            Current balance ({snapshot.settings.currency})
            <input
              type="number"
              step="0.01"
              min="-1000000"
              max="1000000"
              required
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </label>
        </div>
        <p className="muted">
          Use the available balance in your banking app. Enter a credit card
          balance as negative if you owe money.
        </p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={spendable}
            onChange={(e) => setSpendable(e.target.checked)}
          />{" "}
          Include in safe-to-spend
        </label>
        <p className="fine-print">
          Leave this off for savings you want to keep separate. Checking a
          balance reconciles past transactions; it doesn’t add income.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" disabled={busy}>
          {busy ? "Saving…" : "Save account"}
        </button>
      </form>
    </Modal>
  );
}
export function SettingsPage() {
  const { snapshot: s, today } = useData();
  const preview = new URLSearchParams(location.search).get("preview") === "1";
  const toast = useToast();
  const sync = useSyncState();
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [name, setName] = useState(s.settings.name);
  const [currency, setCurrency] = useState(s.settings.currency);
  const [buffer, setBuffer] = useState((s.settings.buffer / 100).toFixed(2));
  const [server, setServer] = useState(apiUrl());
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState("Not requested");
  const [restore, setRestore] = useState<{ text: string; name: string } | null>(
    null,
  );
  const [restoreBusy, setRestoreBusy] = useState(false);
  async function download(content: string, name: string, type: string) {
    try {
      await saveTextFile(name, content, type);
    } catch {
      setError(
        "Could not save that file. Please choose another location or try again.",
      );
    }
  }
  async function readBackup(file?: File) {
    if (!file) return;
    setError("");
    if (file.size > 5_000_000)
      return setError("Choose a Sori JSON backup smaller than 5 MB.");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (
        !["sori", "sori-bloom"].includes(parsed.app) ||
        !parsed.snapshot?.settings
      )
        throw Error("not a backup");
      setRestore({ text, name: file.name });
    } catch {
      setError(
        "That file is not a readable Sori backup. Your budget has not changed.",
      );
    }
  }
  async function restoreBackup() {
    if (!restore) return;
    setRestoreBusy(true);
    setError("");
    try {
      await importJSON(restore.text);
      setRestore(null);
      toast({ message: "Your backup is restored on this device." });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not restore this backup.",
      );
    } finally {
      setRestoreBusy(false);
    }
  }
  async function profile(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await updateSettings(s.settings, {
        name: name.trim(),
        currency,
        buffer: cents(Math.round(Number(buffer) * 100)),
      });
      toast({ message: "Your preferences, saved." });
    } catch {
      setError("Could not save your preferences.");
    }
  }
  async function toggle(field: "sounds" | "haptics", value: boolean) {
    try {
      await updateSettings(s.settings, { [field]: value });
    } catch {
      setError("Could not save that preference.");
    }
  }
  async function reminders(field: string, value: boolean | string) {
    try {
      await updateSettings(s.settings, {
        reminders: { ...s.settings.reminders, [field]: value },
      });
    } catch {
      setError("Could not save reminder preferences.");
    }
  }
  async function connectServer(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const u = new URL(server.trim());
      if (
        u.protocol !== "https:" &&
        !(
          u.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(u.hostname)
        )
      )
        throw Error("Use an HTTPS server address.");
      if (u.username || u.password || u.pathname !== "/" || u.search || u.hash)
        throw Error(
          "Use just your server’s address, without a path or sign-in details.",
        );
      if (apiUrl() && apiUrl() !== u.origin) await disconnect();
      setApiUrl(u.origin);
      await connect(passphrase);
      setPassphrase("");
      toast({ message: "Your devices can breathe together. Sync connected." });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  }
  async function notify() {
    try {
      const p = await notificationPermission(true);
      setPermission(p);
      if (p === "granted") {
        await applyReminders(planReminders(s, today));
        const result = await scheduleTestNotification(5000);
        toast({
          message:
            result === "scheduled"
              ? "A gentle test reminder will arrive in 5 seconds."
              : `Reminders: ${result}`,
        });
      }
    } catch {
      setPermission("Unavailable on this device");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE A LITTLE SPACE FOR YOU</p>
          <h1>Your budget, your way.</h1>
          <p>Small adjustments to make Sori feel like home.</p>
        </div>
        <span className="tag mint">
          <ShieldCheck size={15} /> Local-first & yours
        </span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>
              <Wallet size={20} /> Your accounts
            </h2>
            <button
              className="btn secondary small"
              onClick={() => setAccount(null)}
            >
              <Plus size={16} /> Add account
            </button>
          </div>
          <p className="muted">
            A quick balance check keeps your daily number honest.
          </p>
          <div className="account-list">
            {s.accounts.map((a) => (
              <button
                key={a.id}
                className="account-row"
                onClick={() => setAccount(a)}
              >
                <span className="event-icon mint">
                  <Wallet size={18} />
                </span>
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {a.spendable
                      ? "Included in safe-to-spend"
                      : "Kept separate"}{" "}
                    · Checked {a.checkedOn === today ? "today" : a.checkedOn}
                  </small>
                </span>
                <strong>
                  <Money
                    value={currentBalance(
                      a,
                      s.txns,
                      defaultAccountId(s.accounts),
                    )}
                  />
                </strong>
                <RefreshCw size={15} />
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>A few little preferences</h2>
          <form className="stack" onSubmit={(e) => void profile(e)}>
            <div className="form-grid">
              <label className="field">
                Your name
                <input
                  value={name}
                  maxLength={40}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                Currency
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
            </div>
            <label className="field">
              Safety buffer ({currency})
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={buffer}
                onChange={(e) => setBuffer(e.target.value)}
                required
              />
            </label>
            <p className="fine-print">
              Currency changes the display unit. Existing amounts aren’t
              converted.
            </p>
            <button className="btn secondary" type="submit">
              <Check size={16} /> Save preferences
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>
            <Bell size={20} /> Gentle reminders
          </h2>
          <p className="muted">
            Little taps on the shoulder, at a time that suits you.
          </p>
          {(
            [
              ["bills", "Bills before they’re due"],
              ["payday", "Payday check-in"],
              ["checkIn", "A daily money moment"],
              ["pace", "A category is ahead of pace"],
              ["waitList", "Revisit the 48-hour pause list"],
            ] as const
          ).map(([key, label]) => (
            <label className="toggle-row" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={s.settings.reminders[key]}
                onChange={(e) => void reminders(key, e.target.checked)}
              />
            </label>
          ))}
          <div className="form-grid time-fields">
            <label className="field">
              Daily check-in
              <input
                type="time"
                value={s.settings.reminders.checkInTime}
                onChange={(e) => void reminders("checkInTime", e.target.value)}
              />
            </label>
            <label className="field">
              Quiet from
              <input
                type="time"
                value={s.settings.reminders.quietStart}
                onChange={(e) => void reminders("quietStart", e.target.value)}
              />
            </label>
            <label className="field">
              Quiet until
              <input
                type="time"
                value={s.settings.reminders.quietEnd}
                onChange={(e) => void reminders("quietEnd", e.target.value)}
              />
            </label>
          </div>
          <button className="btn secondary" onClick={() => void notify()}>
            <Bell size={16} /> Enable & test reminders
          </button>
          <p role="status" className="fine-print">
            Permission: {permission}.{" "}
            {Capacitor.isNativePlatform()
              ? "Android schedules local reminders even with the app closed; device battery settings may affect delivery."
              : "Browser reminders work while Sori is open. The Android app can remind you while it’s closed."}
          </p>
        </section>
        <section className="panel">
          <h2>
            <Cloud size={20} /> Keep your devices together
          </h2>
          <p className="muted">
            Optional sync through your own Sori Cloudflare server.
          </p>
          <span className={`tag ${sync.status === "idle" ? "mint" : "peach"}`}>
            {sync.status === "off"
              ? "This device only"
              : sync.status === "idle"
                ? "Connected"
                : sync.status === "syncing"
                  ? "Syncing…"
                  : sync.status === "offline"
                    ? "Offline · changes saved here"
                    : sync.message}
          </span>
          {sync.status !== "off" && (
            <div className="inline-actions">
              <button
                className="btn secondary small"
                onClick={() => void syncNow()}
              >
                <RefreshCw size={14} /> Sync now
              </button>
              <button
                className="btn ghost small"
                onClick={() => void disconnect()}
              >
                <LogOut size={14} /> Disconnect
              </button>
            </div>
          )}
          {preview && (
            <p className="soft-note">
              Sample budgets stay on this device. Start your personal budget to
              connect sync.
            </p>
          )}
          <form onSubmit={(e) => void connectServer(e)} className="stack">
            <fieldset disabled={preview || busy} className="stack">
              <label className="field">
                Sori server address
                <input
                  type="url"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  placeholder="https://sori-bloom-api.you.workers.dev"
                  autoComplete="url"
                  required
                />
              </label>
              <label className="field">
                Your server passphrase
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button className="btn secondary" disabled={busy}>
                {busy ? "Connecting…" : "Connect this device"}
              </button>
            </fieldset>
          </form>
          <p className="fine-print">
            The passphrase goes only to the server you choose. Financial records
            sync after connecting. Keep demo budgets separate from your personal
            server.
          </p>
        </section>
        <section className="panel">
          <h2>
            <Volume2 size={20} /> A softer experience
          </h2>
          <label className="toggle-row">
            <span>
              Gentle sounds<small>Free, softly synthesised little chimes</small>
            </span>
            <input
              type="checkbox"
              checked={s.settings.sounds}
              onChange={(e) => void toggle("sounds", e.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <span>
              Haptic feedback<small>A small tap on supported devices</small>
            </span>
            <input
              type="checkbox"
              checked={s.settings.haptics}
              onChange={(e) => void toggle("haptics", e.target.checked)}
            />
          </label>
          <p className="muted">
            Use the eye and simple-view controls in the header whenever you need
            less on screen. Animations follow your device’s reduced-motion
            setting.
          </p>
        </section>
        <section className="panel peach">
          <h2>
            <LockKeyhole size={20} /> Yours to keep.
          </h2>
          <p>
            A little backup is a kindness to future you. Keep a copy somewhere
            private; backups include your financial records.
          </p>
          <div className="inline-actions">
            <button
              className="btn secondary"
              onClick={() =>
                void download(
                  exportJSON(s),
                  `sori-backup-${today}.json`,
                  "application/json",
                )
              }
            >
              <Download size={16} /> Budget backup
            </button>
            <button
              className="btn secondary"
              onClick={() =>
                void download(
                  exportCSV(s),
                  `sori-spending-${today}.csv`,
                  "text/csv",
                )
              }
            >
              <Download size={16} /> Spending CSV
            </button>
          </div>
          <label className="restore-label">
            <Upload size={16} />
            <span>Restore a budget backup</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                void readBackup(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <p className="fine-print">
            Your data stays on this device unless you connect sync, use cloud
            AI, or choose to share it. No analytics, no ads, no bank access.
          </p>
        </section>
      </div>
      {restore && (
        <Modal
          title="Give your backup a new home"
          onClose={() => {
            if (!restoreBusy) setRestore(null);
          }}
        >
          <div className="stack">
            <p>
              Restore <strong>{restore.name}</strong>? This replaces the budget
              on this device. If sync is connected, these changes also reach
              your other devices.
            </p>
            <p className="muted">
              Download your current budget first if you want to keep a copy.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button
              className="btn secondary"
              onClick={() =>
                void download(
                  exportJSON(s),
                  `sori-before-restore-${today}.json`,
                  "application/json",
                )
              }
            >
              Save my current budget
            </button>
            <button
              className="btn"
              disabled={restoreBusy}
              onClick={() => void restoreBackup()}
            >
              {restoreBusy ? "Restoring…" : "Restore this backup"}
            </button>
          </div>
        </Modal>
      )}
      {account !== undefined && (
        <AccountForm
          account={account ?? undefined}
          onClose={() => setAccount(undefined)}
        />
      )}
    </>
  );
}
