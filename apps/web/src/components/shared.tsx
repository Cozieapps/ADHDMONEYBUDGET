import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { X, Check } from "lucide-react";
import { useData } from "../data/data-context";

export function useMoney() {
  const { snapshot } = useData();
  return (amount: number) =>
    new Intl.NumberFormat(snapshot.settings.locale, {
      style: "currency",
      currency: snapshot.settings.currency,
    }).format(amount / 100);
}
export function Flower({
  className = "",
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
    >
      {[0, 72, 144, 216, 288].map((angle) => (
        <ellipse
          key={angle}
          cx="48"
          cy="31"
          rx="11"
          ry="21"
          fill="currentColor"
          transform={`rotate(${angle} 48 48)`}
        />
      ))}
      <circle cx="48" cy="48" r="8" fill="#f7e4b9" />
    </svg>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
type Notice = {
  message: string;
  action?: () => void | Promise<void>;
  label?: string;
};
const ToastContext = createContext<(notice: Notice) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const show = useCallback((n: Notice) => setNotice(n), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 12000);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{notice.message}</span>
          {notice.action && (
            <button
              onClick={() => {
                void Promise.resolve(notice.action?.())
                  .then(() => setNotice(null))
                  .catch(() =>
                    setNotice({
                      message: "That did not save. Please try again.",
                    }),
                  );
              }}
            >
              {notice.label ?? "Undo"}
            </button>
          )}
          <button aria-label="Dismiss message" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export function Money({ value }: { value: number }) {
  const money = useMoney();
  return <span className="money">{money(value)}</span>;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Flower size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function dateLabel(date: string, short = false) {
  return new Intl.DateTimeFormat(undefined, {
    month: short ? "short" : "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}
