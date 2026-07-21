"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Shield,
  X,
  type LucideIcon,
} from "lucide-react";

export type AlertToastTone = "incident" | "heal" | "threshold";

export type AlertToast = {
  id: string;
  tone: AlertToastTone;
  title: string;
  detail?: string;
  createdAt: number;
};

type PushAlertInput = {
  tone: AlertToastTone;
  title: string;
  detail?: string;
  /** Auto-dismiss ms; default 5200. Pass 0 to keep until dismissed. */
  ttlMs?: number;
};

type AlertToastContextValue = {
  toasts: AlertToast[];
  pushAlert: (input: PushAlertInput) => string;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
};

const AlertToastContext = createContext<AlertToastContextValue | null>(null);

const TONE_META: Record<
  AlertToastTone,
  { Icon: LucideIcon; ring: string; icon: string; bar: string }
> = {
  incident: {
    Icon: AlertTriangle,
    ring: "border-rose-400/35 bg-[#121212]",
    icon: "text-rose-400",
    bar: "bg-rose-400",
  },
  heal: {
    Icon: CheckCircle2,
    ring: "border-blue-500/40 bg-[#121212]",
    icon: "text-blue-400",
    bar: "bg-blue-400",
  },
  threshold: {
    Icon: Shield,
    ring: "border-amber-400/35 bg-[#121212]",
    icon: "text-amber-300",
    bar: "bg-amber-400",
  },
};

const MAX_STACK = 5;

export function AlertToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<AlertToast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const seq = useRef(0);

  const dismissAlert = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const clearAlerts = useCallback(() => {
    for (const t of timers.current.values()) clearTimeout(t);
    timers.current.clear();
    setToasts([]);
  }, []);

  const pushAlert = useCallback(
    (input: PushAlertInput) => {
      seq.current += 1;
      const id = `alert-${seq.current}-${Date.now()}`;
      const toast: AlertToast = {
        id,
        tone: input.tone,
        title: input.title,
        detail: input.detail,
        createdAt: Date.now(),
      };

      setToasts((prev) => [toast, ...prev].slice(0, MAX_STACK));

      const ttl = input.ttlMs ?? 5200;
      if (ttl > 0) {
        const handle = setTimeout(() => dismissAlert(id), ttl);
        timers.current.set(id, handle);
      }

      return id;
    },
    [dismissAlert]
  );

  const value = useMemo(
    () => ({ toasts, pushAlert, dismissAlert, clearAlerts }),
    [toasts, pushAlert, dismissAlert, clearAlerts]
  );

  return (
    <AlertToastContext.Provider value={value}>
      {children}
      <AlertToastStack toasts={toasts} onDismiss={dismissAlert} />
    </AlertToastContext.Provider>
  );
}

export function useAlertToasts(): AlertToastContextValue {
  const ctx = useContext(AlertToastContext);
  if (!ctx) {
    throw new Error("useAlertToasts must be used within AlertToastProvider");
  }
  return ctx;
}

function AlertToastStack({
  toasts,
  onDismiss,
}: {
  toasts: AlertToast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2 sm:bottom-6 sm:right-6"
      aria-live="polite"
      aria-relevant="additions"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {toasts.map((toast) => {
          const meta = TONE_META[toast.tone];
          const Icon = meta.Icon;
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 18, scale: 0.94, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: 28, scale: 0.96, filter: "blur(2px)" }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
              className={`pointer-events-auto relative overflow-hidden rounded-lg border shadow-xl shadow-black/40 ${meta.ring}`}
              role="status"
            >
              <span
                className={`absolute inset-y-0 left-0 w-0.5 ${meta.bar}`}
                aria-hidden
              />
              <div className="flex items-start gap-2.5 px-3.5 py-3 pl-4">
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${meta.icon}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-white">
                    {toast.title}
                  </p>
                  {toast.detail ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                      {toast.detail}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(toast.id)}
                  className="rounded-md p-1 text-zinc-500 transition hover:bg-white/5 hover:text-white"
                  aria-label="Dismiss notification"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <motion.div
                className={`h-0.5 origin-left ${meta.bar} opacity-60`}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 5.2, ease: "linear" }}
                aria-hidden
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
