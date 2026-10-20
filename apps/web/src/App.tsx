import { useState, useEffect, Component, type ReactNode } from "react";
import {
  HashRouter,
  NavLink,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import {
  Sun,
  Wallet,
  CalendarDays,
  Sprout,
  TrendingUp,
  ChartNoAxesCombined,
  Settings2,
  Eye,
  EyeOff,
  PanelTop,
  Sparkles,
  Bell,
  Plus,
  ChevronRight,
  CloudOff,
  CreditCard,
  ArrowRight,
  Menu,
  X,
} from "lucide-react";
import { DataProvider, useData } from "./data/data-context";
import { ToastProvider, Flower } from "./components/shared";
import { Log } from "./components/Log";
import { AppEffects } from "./components/AppEffects";
import { Setup } from "./pages/Setup";
import { TodayPage } from "./pages/Today";
import { CoachPage } from "./pages/Coach";
import { SettingsPage } from "./pages/Settings";
import {
  SpendingPage,
  CalendarPage,
  ForecastPage,
  GoalsPage,
  DebtPage,
  InsightsPage,
} from "./pages/Planning";
import { useSyncState } from "./platform/sync";
import "./styles.css";
import "./pages/planning.css";

const navigation = [
  { to: "/", label: "Today", icon: Sun },
  { to: "/spending", label: "My money", icon: Wallet },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/goals", label: "Goals & wishes", icon: Sprout },
  { to: "/debt", label: "A little less debt", icon: CreditCard },
  { to: "/forecast", label: "Look ahead", icon: TrendingUp },
  { to: "/insights", label: "Little insights", icon: ChartNoAxesCombined },
];
function preference(key: string) {
  try {
    return localStorage.getItem(`sori.bloom.${key}`) === "true";
  } catch {
    return false;
  }
}
function Shell() {
  const { snapshot, ready } = useData();
  const [log, setLog] = useState<string | null>(null);
  const [hide, setHide] = useState(() => preference("hide"));
  const [simple, setSimple] = useState(() => preference("simple"));
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const sync = useSyncState();
  const preview =
    new URLSearchParams(window.location.search).get("preview") === "1";
  useEffect(() => {
    if (!menu) return;
    const panel = document.querySelector<HTMLElement>(".sidebar");
    const before = document.activeElement as HTMLElement | null;
    panel?.querySelector<HTMLElement>(".mobile-close")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>("a,button")].filter(
        (el) => el.getBoundingClientRect().width > 0,
      );
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, [menu]);
  useEffect(() => {
    const handle = (e: Event) =>
      setLog((e as CustomEvent<string>).detail ?? "");
    window.addEventListener("sori:log", handle);
    return () => window.removeEventListener("sori:log", handle);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("sori.bloom.hide", String(hide));
      localStorage.setItem("sori.bloom.simple", String(simple));
    } catch {
      /* Session preferences still work. */
    }
  }, [hide, simple]);
  if (!ready)
    return (
      <div className="app-loading" role="status">
        <Flower size={64} />
        <p>Making a little space…</p>
      </div>
    );
  if (!snapshot.settings.setupDone) return <Setup />;
  const routeName =
    location.pathname === "/coach"
      ? "Your companion"
      : location.pathname === "/settings"
        ? "Settings"
        : (navigation.find((n) => n.to === location.pathname)?.label ??
          "Today");
  const openLog = (initial = "") => setLog(initial);
  return (
    <div className={`app-layout ${hide ? "privacy" : ""}`}>
      <AppEffects />
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to your budget
      </a>
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="sidebar-top">
          <Link to="/" className="brand" onClick={() => setMenu(false)}>
            <Flower size={44} />
            <span>
              sori<span className="brand-dot">.</span>
              <small>A LITTLE MORE AT EASE</small>
            </span>
          </Link>
          <button
            className="icon-button mobile-close"
            onClick={() => setMenu(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-intro">
          <span className="eyebrow">YOUR LITTLE MONEY SPACE</span>
          <p>
            Small steps.
            <br />A softer landing.
          </p>
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon }, i) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""} ${i === 3 ? "nav-divider" : ""}`
              }
              onClick={() => setMenu(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
              <ChevronRight size={14} />
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-companion">
          <div className="companion-icon">
            <Sparkles size={21} />
          </div>
          <h2>
            A little support
            <br />
            goes a long way.
          </h2>
          <p>
            Untangle the numbers.
            <br />
            Find your next small step.
          </p>
          <NavLink
            to="/coach"
            className="companion-link"
            onClick={() => setMenu(false)}
          >
            Talk with Sori <ArrowRight size={15} />
          </NavLink>
          <Flower className="companion-flower" size={80} />
        </div>
        <div className="sidebar-bottom">
          <NavLink
            to="/settings"
            className="nav-item"
            onClick={() => setMenu(false)}
          >
            <Settings2 size={18} />
            <span>Settings & you</span>
          </NavLink>
          <div className="storage-status">
            <span className="status-dot" />
            {sync.status === "idle"
              ? "Synced with your server"
              : sync.status === "syncing"
                ? "Gently syncing…"
                : sync.status === "error"
                  ? "Sync needs a check-in"
                  : "Saved on this device"}
            <CloudOff size={14} />
          </div>
          <div className="sidebar-person">
            <span className="avatar">
              {snapshot.settings.name.slice(0, 1).toUpperCase() || "S"}
            </span>
            <div>
              <strong>{snapshot.settings.name || "Your space"}</strong>
              <small>A fresh little perspective</small>
            </div>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            <span>Your space</span>
            <ChevronRight size={13} />
            <strong>{routeName}</strong>
          </div>
          <div className="topbar-actions">
            <span className="header-date">
              {new Intl.DateTimeFormat(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              }).format(new Date())}
            </span>
            <button
              className="icon-button"
              aria-label={hide ? "Show amounts" : "Hide amounts"}
              aria-pressed={hide}
              onClick={() => setHide(!hide)}
            >
              {hide ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            <button
              className={`btn simple-button ${simple ? "selected" : ""}`}
              aria-pressed={simple}
              onClick={() => setSimple(!simple)}
            >
              <PanelTop size={15} />
              <span>Simple view</span>
            </button>
            <Link
              className="icon-button"
              to="/settings"
              aria-label="Reminder settings"
            >
              <Bell size={19} />
            </Link>
            <Link
              to="/settings"
              className="avatar small"
              aria-label="Your settings"
            >
              {snapshot.settings.name.slice(0, 1).toUpperCase() || "S"}
            </Link>
          </div>
        </header>
        {preview && (
          <div className="preview-banner">
            <span>
              <Sparkles size={15} /> You’re exploring a sample budget. Your
              personal budget stays separate.
            </span>
            <a href="/#/">
              Start my fresh budget <ArrowRight size={15} />
            </a>
          </div>
        )}
        <main id="main-content" className="main-content" tabIndex={-1}>
          <Routes>
            <Route
              path="/"
              element={<TodayPage onLog={openLog} simple={simple} />}
            />
            <Route path="/spending" element={<SpendingPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/forecast" element={<ForecastPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/debt" element={<DebtPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/coach" element={<CoachPage onLog={openLog} />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="*"
              element={
                <div className="empty-state">
                  <h1>A little detour.</h1>
                  <Link to="/">Back to Today</Link>
                </div>
              }
            />
          </Routes>
        </main>
        <nav className="mobile-nav" aria-label="Quick navigation">
          <NavLink to="/" end>
            <Sun size={21} />
            <span>Today</span>
          </NavLink>
          <NavLink to="/spending">
            <Wallet size={21} />
            <span>Money</span>
          </NavLink>
          <button
            className="mobile-log"
            onClick={() => openLog()}
            aria-label="Log money"
          >
            <Plus size={24} />
          </button>
          <NavLink to="/calendar">
            <CalendarDays size={21} />
            <span>Calendar</span>
          </NavLink>
          <NavLink to="/coach">
            <Sparkles size={21} />
            <span>Sori</span>
          </NavLink>
        </nav>
      </div>
      {log !== null && <Log initial={log} onClose={() => setLog(null)} />}
    </div>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="app-loading">
        <Flower size={60} />
        <h1>Let’s take a little breath.</h1>
        <p>
          Sori couldn’t open this time. Please check that device storage is
          available.
        </p>
        <button className="btn" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  return (
    <ErrorBoundary>
      <DataProvider>
        <ToastProvider>
          <HashRouter>
            <Shell />
          </HashRouter>
        </ToastProvider>
      </DataProvider>
    </ErrorBoundary>
  );
}
