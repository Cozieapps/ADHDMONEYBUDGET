import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Check,
  ChevronDown,
  Wallet,
  Sparkles,
  Leaf,
  ArrowDownLeft,
  CircleHelp,
} from "lucide-react";
import {
  safeToSpend,
  forecast,
  scheduleBetween,
  addDays,
  winsFor,
  nudges,
} from "@sori/core";
import { useData } from "../data/data-context";
import { setWin } from "../data/actions";
import {
  Flower,
  Money,
  dateLabel,
  Empty,
  useMoney,
  useToast,
} from "../components/shared";

export function BalanceChart({ compact = false }: { compact?: boolean }) {
  const { snapshot, today } = useData();
  const f = forecast(snapshot, today, 30);
  const money = useMoney();
  const values = f.days.map((d) => d.balance);
  const low = Math.min(0, ...values);
  const high = Math.max(100, ...values, f.protectedAmount) * 1.15;
  const y = (v: number) => 148 - ((v - low) / (high - low)) * 120;
  const pts = values.map((v, i) => `${32 + (i / 29) * 560},${y(v)}`);
  const path = `M${pts.join(" L")}`;
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className={`balance-chart ${compact ? "compact" : ""}`}>
      <svg
        viewBox="0 0 640 188"
        role="img"
        aria-label={`30-day projected balance, lowest ${money(f.lowest.balance)} on ${dateLabel(f.lowest.date)}. Estimate based on scheduled payments and daily spending.`}
      >
        <defs>
          <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b4cab5" stopOpacity=".5" />
            <stop offset="100%" stopColor="#b4cab5" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2].map((i) => (
          <line
            key={i}
            x1="32"
            x2="592"
            y1={28 + i * 60}
            y2={28 + i * 60}
            stroke="#e9ece5"
          />
        ))}
        <path d={`${path} L592,150 L32,150 Z`} fill="url(#balance-fill)" />
        <line
          x1="32"
          x2="592"
          y1={y(f.protectedAmount)}
          y2={y(f.protectedAmount)}
          stroke="#ba9e86"
          strokeDasharray="5 5"
        />
        <path
          d={path}
          stroke="#5d8770"
          strokeWidth="2.8"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {[0, 7, 14, 21, 29].map((i) => (
          <text
            key={i}
            x={32 + (i / 29) * 560}
            y="177"
            textAnchor={i === 0 ? "start" : i === 29 ? "end" : "middle"}
            fill="#55674f"
            fontSize="11"
          >
            {dateLabel(f.days[i]!.date, true)}
          </text>
        ))}
        {f.days.map((d, i) => (
          <circle
            key={d.date}
            cx={32 + (i / 29) * 560}
            cy={y(d.balance)}
            r={selected === i ? 5 : 3}
            fill={selected === i ? "#365d4d" : "transparent"}
            stroke={selected === i ? "#fff" : "transparent"}
            role="img"
            tabIndex={0}
            aria-label={`${dateLabel(d.date)}: ${money(d.balance)}`}
            onMouseEnter={() => setSelected(i)}
            onFocus={() => setSelected(i)}
            onBlur={() => setSelected(null)}
          />
        ))}
      </svg>
      <div className="chart-caption">
        <span>
          <i className="legend-dot" /> Projected balance
        </span>
        <span>
          <i className="legend-line" /> Protected money
        </span>
        {selected !== null && (
          <strong className="money">
            {dateLabel(f.days[selected]!.date, true)} ·{" "}
            {money(f.days[selected]!.balance)}
          </strong>
        )}
      </div>
    </div>
  );
}

export function TodayPage({
  onLog,
  simple,
}: {
  onLog: (initial?: string) => void;
  simple: boolean;
}) {
  const { snapshot: s, today } = useData();
  const safe = safeToSpend(s, today);
  const wins = winsFor(s, today);
  const f = forecast(s, today, 30);
  const toast = useToast();
  const [math, setMath] = useState(false);
  const upcoming = scheduleBetween(s, today, addDays(today, 14))
    .filter((x) => !x.paid)
    .slice(0, 4);
  const nudge = nudges(s, today)[0];
  const goals = s.goals.filter((g) => !g.archived).slice(0, 3);
  const recent = [...s.txns]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);
  async function nothing() {
    try {
      await setWin(s, today, { nothingToLog: !wins.nothingToLog });
    } catch {
      toast({ message: "Could not save your check-in. Please try again." });
    }
  }
  return (
    <>
      <div className="page-heading today-heading">
        <div>
          <p className="eyebrow">A LITTLE CLARITY FOR YOUR DAY</p>
          <h1>
            Hey {s.settings.name || "there"}, you’re doing okay
            <span className="heading-flower">✳</span>
          </h1>
          <p>Let’s make a little room for what matters.</p>
        </div>
        <button className="btn" onClick={() => onLog()}>
          <Plus size={18} /> Log money
        </button>
      </div>
      <div className="today-top">
        <section className="safe-card">
          <div className="safe-topline">
            <span className="eyebrow">YOUR SAFE-TO-SPEND TODAY</span>
            <span className="safe-badge">
              <span />{" "}
              {safe.status === "good"
                ? "A little breathing room"
                : safe.status === "over"
                  ? "Let’s adjust the plan"
                  : "A gentler pace today"}
            </span>
          </div>
          <div className="safe-value">
            <Money value={safe.leftToday} />
            <span>/ today</span>
          </div>
          <p className="safe-explanation">
            {safe.paydayKnown ? (
              <>
                <Money value={safe.untilPayday} /> to last {safe.daysLeft}{" "}
                {safe.daysLeft === 1 ? "day" : "days"}, until payday on{" "}
                {dateLabel(safe.nextPayday, true)}.
              </>
            ) : (
              <>
                An estimate until {dateLabel(safe.nextPayday, true)}. Add your
                payday for a clearer picture.
              </>
            )}
          </p>
          <div className="safe-rule" />
          <div className="safe-summary">
            <span>
              <Wallet size={16} /> Available{" "}
              <strong>
                <Money value={safe.accounts} />
              </strong>
            </span>
            <span>
              Set aside{" "}
              <strong>
                <Money
                  value={safe.bills + safe.debts + safe.goals + safe.buffer}
                />
              </strong>
            </span>
            <button
              className="text-button"
              onClick={() => setMath(!math)}
              aria-expanded={math}
            >
              The little maths <ChevronDown size={15} />
            </button>
          </div>
          {math && (
            <dl className="money-maths">
              {[
                ["Your available balance", safe.accounts],
                ["Expected income", safe.incoming],
                ["Bills before payday", -safe.bills],
                ["Debt payments", -safe.debts],
                ["Goal contributions", -safe.goals],
                ["Your safety buffer", -safe.buffer],
                ["Available until payday", safe.untilPayday],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <Money value={Number(value)} />
                  </dd>
                </div>
              ))}
              <p>
                Divide the available amount by {safe.daysLeft} days, then
                account for today’s spending. Estimates rely on your logged
                data.
              </p>
            </dl>
          )}
          <div className="safe-bottom">
            <span>
              <Leaf size={15} /> Bills & buffer come first. You come next.
            </span>
            <Link to="/forecast">
              Can I afford it? <ArrowUpRight size={16} />
            </Link>
          </div>
          <Flower className="safe-flower" size={200} />
        </section>
        <section className="nudge-card">
          <span className="tiny-icon">
            <Sparkles size={20} />
          </span>
          <span className="eyebrow">ONE GENTLE NEXT STEP</span>
          <h2>{nudge?.title ?? "A tiny check-in goes a long way."}</h2>
          <p>
            {nudge?.body ??
              "Take a breath, check your balance, and let the rest of your day be yours."}
          </p>
          <Link to={nudge?.action?.to ?? "/settings"} className="text-button">
            {nudge?.action?.label ?? "Check my balance"}
            <ArrowRight size={16} />
          </Link>
          <div className="nudge-bottom">
            No perfect streaks needed. Just you, showing up.
          </div>
        </section>
      </div>
      <div className="wins-strip">
        <div className="wins-label">
          <Leaf size={21} />
          <div>
            <strong>Little wins, real progress.</strong>
            <span>{wins.count} of 3 today. Every little bit counts.</span>
          </div>
        </div>
        <Link
          className={wins.checkedBalance ? "win done" : "win"}
          to="/settings"
        >
          <span>{wins.checkedBalance && <Check size={13} />}</span>Checked my
          balance
        </Link>
        <Link className={wins.tickedBills ? "win done" : "win"} to="/calendar">
          <span>{wins.tickedBills && <Check size={13} />}</span>Bills are up to
          date
        </Link>
        <button
          className={wins.logged ? "win done" : "win"}
          onClick={() => {
            if (wins.logged) void nothing();
            else onLog();
          }}
        >
          <span>{wins.logged && <Check size={13} />}</span>Logged a little
        </button>
        <button
          className="text-button nothing-button"
          onClick={() => void nothing()}
        >
          {wins.nothingToLog ? "Undo quiet day" : "Nothing to log today"}
        </button>
      </div>
      {!simple && (
        <>
          <div className="today-middle">
            <section className="panel forecast-panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">A LITTLE LOOK AHEAD</span>
                  <h2>Your next 30 days</h2>
                </div>
                <Link className="text-button" to="/forecast">
                  Explore forecast <ArrowUpRight size={16} />
                </Link>
              </div>
              {s.repeats.length ? (
                <>
                  <div className="forecast-annotation">
                    <span>
                      Lowest point{" "}
                      <strong>
                        <Money value={f.lowest.balance} />
                      </strong>
                      <small>on {dateLabel(f.lowest.date, true)}</small>
                    </span>
                    <span className="tag mint">
                      <span /> Based on your plan
                    </span>
                  </div>
                  <BalanceChart />
                </>
              ) : (
                <Empty title="Let’s connect a few dots">
                  Add your bills and payday to see what’s coming.
                </Empty>
              )}
            </section>
            <section className="panel coming-panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">ON THE HORIZON</span>
                  <h2>Coming up</h2>
                </div>
                <Link
                  className="icon-button"
                  aria-label="Open calendar"
                  to="/calendar"
                >
                  <ArrowUpRight size={19} />
                </Link>
              </div>
              {upcoming.length ? (
                <div className="upcoming-list">
                  {upcoming.map((item) => (
                    <Link
                      to="/calendar"
                      key={item.key}
                      className="upcoming-row"
                    >
                      <span
                        className={`event-icon ${item.isIncome ? "mint" : "peach"}`}
                      >
                        {item.isIncome ? (
                          <ArrowDownLeft size={19} />
                        ) : (
                          <ArrowUpRight size={19} />
                        )}
                      </span>
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.date === today
                            ? "Today"
                            : dateLabel(item.date, true)}
                          {item.autopay ? " · Auto-pay" : ""}
                        </small>
                      </span>
                      <strong className={item.isIncome ? "positive" : ""}>
                        {item.isIncome ? "+" : ""}
                        <Money value={item.amount} />
                      </strong>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty title="A clear little calendar">
                  Add a bill or payday to make your plan.
                </Empty>
              )}
              <Link className="coming-link" to="/calendar">
                See your calendar <ArrowRight size={16} />
              </Link>
            </section>
          </div>
          <div className="today-bottom">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">FOR FUTURE YOU</span>
                  <h2>Good things take a little growing.</h2>
                </div>
                <Link className="text-button" to="/goals">
                  Your goals <ArrowUpRight size={16} />
                </Link>
              </div>
              {goals.length ? (
                <div className="goal-mini-grid">
                  {goals.map((g) => (
                    <Link
                      to="/goals"
                      key={g.id}
                      className={`goal-mini ${g.tone}`}
                    >
                      <span className="goal-emoji">{g.emoji}</span>
                      <h3>{g.name}</h3>
                      <p>
                        <strong>
                          <Money value={g.saved} />
                        </strong>
                        <span>
                          {" "}
                          of <Money value={g.target} />
                        </span>
                      </p>
                      <div className="progress-track">
                        <div
                          style={{
                            width: `${Math.min(100, (g.saved / Math.max(1, g.target)) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>
                        {Math.round((g.saved / Math.max(1, g.target)) * 100)}%
                        of the way there
                      </small>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty title="Something worth looking forward to">
                  Give your next little dream a place to grow.
                </Empty>
              )}
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">YOUR MONEY IN MOTION</span>
                  <h2>The latest little things</h2>
                </div>
                <Link
                  className="icon-button"
                  aria-label="See all spending"
                  to="/spending"
                >
                  <ArrowUpRight size={19} />
                </Link>
              </div>
              {recent.length ? (
                recent.map((t) => (
                  <div className="activity-row" key={t.id}>
                    <span
                      className={`activity-icon ${t.type === "income" ? "mint" : "lavender"}`}
                    >
                      {s.categories.find((c) => c.id === t.categoryId)?.emoji ??
                        "↔"}
                    </span>
                    <span>
                      <strong>{t.note || t.merchant || t.type}</strong>
                      <small>
                        {dateLabel(t.date, true)}
                        {t.source === "claude" ? " · Added by Claude" : ""}
                      </small>
                    </span>
                    <strong className={t.type === "income" ? "positive" : ""}>
                      {t.type === "income" ? "+" : "−"}
                      <Money value={t.amount} />
                    </strong>
                  </div>
                ))
              ) : (
                <Empty title="A fresh page">
                  Your first logged expense will appear here.
                </Empty>
              )}
            </section>
          </div>
        </>
      )}
      <footer className="daily-footer">
        <Flower size={18} />
        <span>
          You don’t have to have it all figured out to take the next small step.
        </span>
        <CircleHelp size={15} />
        <span>
          Estimates, always. Your bank balance is the source of truth.
        </span>
      </footer>
    </>
  );
}
