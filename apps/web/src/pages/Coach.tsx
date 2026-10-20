import { useState, useRef, useEffect, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUp,
  Sparkles,
  MessageCircle,
  Copy,
  ExternalLink,
  PenLine,
  ShieldCheck,
  Cloud,
  Leaf,
} from "lucide-react";
import { useData } from "../data/data-context";
import { localReply, budgetContext } from "../platform/local-coach";
import { askCoach } from "../platform/ai";
import { isConnected } from "../platform/sync";
import { connectorUrl } from "../platform/config";
import { Flower, useToast } from "../components/shared";

type Message = { role: "user" | "sori"; text: string };
export function CoachPage({ onLog }: { onLog: (initial?: string) => void }) {
  const { snapshot, today } = useData();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [remote, setRemote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const prompts = [
    "What’s one good step today?",
    "Can I afford 40 for a treat?",
    "Money feels overwhelming.",
    "How can I save a little more?",
  ];
  useEffect(() => {
    if (messages.length)
      bottom.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "nearest",
      });
  }, [messages]);
  async function send(text: string) {
    if (!text.trim() || busy) return;
    const question = text.trim();
    setInput("");
    setError("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setBusy(true);
    try {
      const reply = remote
        ? await askCoach(question, snapshot)
        : localReply(question, snapshot, today);
      setMessages((prev) => [...prev, { role: "sori", text: reply }]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not reach your companion. Your budget is safe.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ message });
    } catch {
      setError(
        "Clipboard unavailable. You can select and copy the text instead.",
      );
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LESS TO CARRY ON YOUR OWN</p>
          <h1>A little help, a little kindness.</h1>
          <p>A thinking partner for your money. Always on your side.</p>
        </div>
        <span className="tag mint">
          <ShieldCheck size={15} /> You stay in charge
        </span>
      </div>
      <div className="coach-layout">
        <section className="panel chat-panel">
          <div className="chat-top">
            <div className="coach-avatar">
              <Flower size={27} />
            </div>
            <div>
              <strong>Sori companion</strong>
              <small>
                <span className="status-dot" />
                {remote
                  ? "Cloudflare AI · sends a budget summary"
                  : "On-device guide · works offline"}
              </small>
            </div>
            <label className="switch-label">
              <input
                type="checkbox"
                checked={remote}
                onChange={(e) => {
                  setRemote(e.target.checked);
                  setError("");
                }}
              />
              <span>Use free AI</span>
            </label>
          </div>
          {remote && (
            <div className="soft-note compact">
              <Cloud size={18} />
              <p>
                Opt-in: your message and a limited money summary are sent to
                your Cloudflare Worker. Requires sync and AI enabled in your
                free account. Daily limits apply.
              </p>
            </div>
          )}
          <div
            className="chat-messages"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 ? (
              <div className="chat-welcome">
                <Flower size={64} />
                <h2>Your money has a softer place to land.</h2>
                <p>
                  We can untangle a plan, think through a purchase, or just find
                  one small next step.
                </p>
                <div className="prompt-grid">
                  {prompts.map((p, i) => (
                    <button
                      className="prompt"
                      key={p}
                      onClick={() => void send(p)}
                    >
                      <span>
                        {
                          [
                            <Leaf size={17} />,
                            <Sparkles size={17} />,
                            <MessageCircle size={17} />,
                            <PenLine size={17} />,
                          ][i]
                        }
                      </span>
                      {p}
                      <ArrowUp size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`chat-message ${m.role}`}>
                  <span className="chat-sender">
                    {m.role === "sori" ? "Sori" : "You"}
                  </span>
                  <p>{m.text}</p>
                  {m.role === "sori" &&
                    m.text.includes("Review a money entry") && (
                      <button
                        className="btn secondary small"
                        onClick={() => onLog(messages[i - 1]?.text ?? "")}
                      >
                        <PenLine size={14} /> Review a money entry
                      </button>
                    )}
                </div>
              ))
            )}
            {busy && (
              <p className="muted" role="status">
                Making a little sense of things…
              </p>
            )}
            <div ref={bottom} />
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              {remote && !isConnected() && (
                <>
                  {" "}
                  <Link to="/settings">Connect in Settings</Link>.
                </>
              )}{" "}
              <button
                className="text-button"
                onClick={() => {
                  setRemote(false);
                  setError("");
                }}
              >
                Use on-device guide
              </button>
            </div>
          )}
          <form className="chat-input" onSubmit={submit}>
            <label className="sr-only" htmlFor="coach-message">
              Message Sori
            </label>
            <input
              id="coach-message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={600}
              placeholder="What’s on your mind?"
              required
            />
            <button
              className="btn icon-send"
              aria-label="Send message"
              disabled={busy || !input.trim()}
            >
              <ArrowUp size={20} />
            </button>
          </form>
          <p className="fine-print">
            {remote
              ? "AI can make mistakes. Check the numbers before acting."
              : "Guidance from your budget’s maths and patterns. No generative AI in this mode."}{" "}
            Nothing changes without you saving it.
          </p>
        </section>
        <aside className="coach-aside">
          <section className="panel peach">
            <span className="eyebrow">YOUR EXISTING SUBSCRIPTION</span>
            <h2>Bring your favourite thinking partner.</h2>
            <p>
              Use Claude or ChatGPT to talk through a plan, with a small summary
              you choose to share.
            </p>
            <button
              className="btn secondary full"
              onClick={() =>
                void copy(
                  budgetContext(snapshot, today),
                  "Budget summary copied. Paste it into the chat you choose.",
                )
              }
            >
              <Copy size={16} /> Copy my money context
            </button>
            <div className="external-chats">
              <a href="https://claude.ai/new" target="_blank" rel="noreferrer">
                Open Claude <ExternalLink size={14} />
              </a>
              <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">
                Open ChatGPT <ExternalLink size={14} />
              </a>
            </div>
            <p className="fine-print">
              A subscription is separate from API access. This handoff doesn’t
              use paid APIs.
            </p>
          </section>
          <section className="panel">
            <span className="tiny-icon mint">
              <PenLine size={19} />
            </span>
            <h2>Let Claude lend a hand.</h2>
            <p>
              Connect your Sori MCP server in Claude to read your plan and log
              money using supported tools.
            </p>
            {connectorUrl() ? (
              <>
                <code className="connector-code">{connectorUrl()}</code>
                <button
                  className="btn secondary"
                  onClick={() =>
                    void copy(connectorUrl()!, "Connector address copied.")
                  }
                >
                  <Copy size={15} /> Copy connector address
                </button>
              </>
            ) : (
              <Link to="/settings" className="text-button">
                Connect your Sori server <ArrowUp size={15} />
              </Link>
            )}
            <p className="fine-print">
              Claude connector availability depends on your plan. Approve tools
              in Claude before they change your budget.
            </p>
          </section>
          <div className="kind-note">
            <Flower size={32} />
            <p>You deserve support that doesn’t make you feel small.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
