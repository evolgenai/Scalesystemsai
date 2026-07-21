"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, Mail, MessageCircle, Send } from "lucide-react";

type ChannelId = "telegram" | "whatsapp" | "email";

type ChannelState = {
  id: ChannelId;
  label: string;
  status: "idle" | "pushing" | "delivered";
};

const CHANNELS: { id: ChannelId; label: string; Icon: typeof Send }[] = [
  { id: "telegram", label: "Telegram", Icon: Send },
  { id: "whatsapp", label: "WhatsApp Business API", Icon: MessageCircle },
  { id: "email", label: "Email", Icon: Mail },
];

type NotificationDispatchFeedProps = {
  /** Fire when Validator Agent has approved a heal patch. */
  dispatch: boolean;
  payloadSummary?: string;
};

export default function NotificationDispatchFeed({
  dispatch,
  payloadSummary = "Self-heal patch approved by Validation Agent",
}: NotificationDispatchFeedProps) {
  const [channels, setChannels] = useState<ChannelState[]>(() =>
    CHANNELS.map((c) => ({ id: c.id, label: c.label, status: "idle" }))
  );
  const [showFly, setShowFly] = useState(false);

  useEffect(() => {
    if (!dispatch) {
      setChannels(
        CHANNELS.map((c) => ({ id: c.id, label: c.label, status: "idle" }))
      );
      setShowFly(false);
      return;
    }

    setShowFly(true);
    setChannels(
      CHANNELS.map((c) => ({ id: c.id, label: c.label, status: "pushing" }))
    );

    const timers = CHANNELS.map((c, i) =>
      window.setTimeout(() => {
        setChannels((prev) =>
          prev.map((ch) =>
            ch.id === c.id ? { ...ch, status: "delivered" } : ch
          )
        );
      }, 420 + i * 380)
    );

    const hide = window.setTimeout(() => setShowFly(false), 2000);

    return () => {
      timers.forEach(clearTimeout);
      window.clearTimeout(hide);
    };
  }, [dispatch]);

  if (!dispatch) return null;

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/5 bg-[#0a0a0a]">
      <div className="flex items-center gap-2 border-b border-white/5 px-2.5 py-1.5">
        <Bell className="h-3 w-3 text-blue-400" aria-hidden />
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Notification dispatch logs
        </p>
      </div>

      <AnimatePresence>
        {showFly ? (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: -6, scale: 1 }}
            exit={{ opacity: 0, y: -28, scale: 0.96 }}
            transition={{ duration: 0.85, ease: "easeOut" }}
            className="pointer-events-none absolute inset-x-0 top-9 z-10 flex justify-center"
            aria-hidden
          >
            <span className="rounded-md border border-blue-500/40 bg-blue-500/15 px-2.5 py-1 font-mono text-[9px] text-blue-300 shadow-lg shadow-blue-500/10">
              ✦ payload → channels
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ul className="space-y-1.5 p-2.5">
        {CHANNELS.map(({ id, label, Icon }) => {
          const state = channels.find((c) => c.id === id)?.status ?? "idle";
          return (
            <li
              key={id}
              className={`flex items-center gap-2 rounded-md border border-white/5 bg-[#121212] px-2.5 py-2 transition ${
                state === "delivered" ? "border-l-2 border-l-blue-400" : ""
              } ${state === "pushing" ? "animate-pulse" : ""}`}
            >
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${
                  state === "delivered"
                    ? "text-blue-400"
                    : state === "pushing"
                      ? "text-amber-300"
                      : "text-zinc-500"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-white">
                  {label}
                </p>
                <p className="truncate font-mono text-[9px] text-zinc-500">
                  {state === "delivered"
                    ? payloadSummary.slice(0, 64)
                    : state === "pushing"
                      ? "Pushing notification payload…"
                      : "Standing by"}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide ${
                  state === "delivered"
                    ? "text-blue-400"
                    : state === "pushing"
                      ? "text-amber-300"
                      : "text-zinc-500"
                }`}
              >
                {state === "delivered" ? (
                  <Check className="h-3 w-3" aria-hidden />
                ) : null}
                {state === "delivered"
                  ? "Sent"
                  : state === "pushing"
                    ? "Pushing"
                    : "Idle"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
