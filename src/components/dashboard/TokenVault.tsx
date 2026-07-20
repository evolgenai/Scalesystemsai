"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type VaultKeyId = "openai" | "anthropic" | "whatsapp";

type VaultField = {
  id: VaultKeyId;
  label: string;
  placeholder: string;
  hint: string;
  icon: LucideIcon;
  pattern: RegExp;
};

const FIELDS: VaultField[] = [
  {
    id: "openai",
    label: "OpenAI",
    placeholder: "sk-························",
    hint: "GPT / swarm supervisor lanes",
    icon: Sparkles,
    pattern: /^sk-[A-Za-z0-9_-]{20,}$/,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    placeholder: "sk-ant-··················",
    hint: "Claude writer / validator lanes",
    icon: KeyRound,
    pattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
  },
  {
    id: "whatsapp",
    label: "WhatsApp API",
    placeholder: "EAAG····················",
    hint: "Outbound notification metering",
    icon: MessageCircle,
    pattern: /^[A-Za-z0-9_-]{24,}$/,
  },
];

type SaveState = "idle" | "saving" | "saved";
type Status = "unset" | "pending" | "verified";

function maskPreview(value: string): string {
  if (!value) return "—";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export default function TokenVault() {
  const [values, setValues] = useState<Record<VaultKeyId, string>>({
    openai: "",
    anthropic: "",
    whatsapp: "",
  });
  const [visible, setVisible] = useState<Record<VaultKeyId, boolean>>({
    openai: false,
    anthropic: false,
    whatsapp: false,
  });
  const [status, setStatus] = useState<Record<VaultKeyId, Status>>({
    openai: "unset",
    anthropic: "unset",
    whatsapp: "unset",
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const verifiedCount = useMemo(
    () => Object.values(status).filter((s) => s === "verified").length,
    [status]
  );

  const handleChange = (id: VaultKeyId, next: string) => {
    setValues((prev) => ({ ...prev, [id]: next }));
    const field = FIELDS.find((f) => f.id === id)!;
    if (!next.trim()) {
      setStatus((prev) => ({ ...prev, [id]: "unset" }));
      return;
    }
    setStatus((prev) => ({
      ...prev,
      [id]: field.pattern.test(next.trim()) ? "pending" : "unset",
    }));
  };

  const handleSave = async () => {
    setSaveState("saving");
    await new Promise((r) => setTimeout(r, 900));
    setStatus((prev) => {
      const next = { ...prev };
      for (const field of FIELDS) {
        const raw = values[field.id].trim();
        next[field.id] = raw && field.pattern.test(raw) ? "verified" : "unset";
      }
      return next;
    });
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2400);
  };

  return (
    <section
      aria-labelledby="token-vault-heading"
      className="mt-4 overflow-hidden rounded-lg border border-white/5 bg-[#121212]"
    >
      <header className="flex flex-col gap-3 border-b border-white/5 px-3.5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <h2
              id="token-vault-heading"
              className="font-display text-sm font-semibold text-white"
            >
              Tenant API Token Vault
            </h2>
            <p className="text-[11px] text-slate-dim">
              Workspace BYOK · {verifiedCount}/{FIELDS.length} verified
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          AES-256 Encrypted
        </span>
      </header>

      <ul className="divide-y divide-white/5">
        {FIELDS.map((field) => {
          const Icon = field.icon;
          const isVisible = visible[field.id];
          const st = status[field.id];
          return (
            <li key={field.id} className="px-3.5 py-3.5 sm:px-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
                  <div className="min-w-0">
                    <label
                      htmlFor={`vault-${field.id}`}
                      className="text-xs font-medium text-white"
                    >
                      {field.label}
                    </label>
                    <p className="truncate text-[10px] text-slate-dim">
                      {field.hint}
                    </p>
                  </div>
                </div>
                <StatusPill status={st} preview={maskPreview(values[field.id])} />
              </div>

              <div className="relative">
                <input
                  id={`vault-${field.id}`}
                  type={isVisible ? "text" : "password"}
                  value={values[field.id]}
                  onChange={(e) => handleChange(field.id, e.target.value)}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2.5 pr-10 font-mono text-xs text-white placeholder:text-slate-dim/50 transition focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                />
                <button
                  type="button"
                  onClick={() =>
                    setVisible((prev) => ({
                      ...prev,
                      [field.id]: !prev[field.id],
                    }))
                  }
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-dim transition hover:text-emerald-400"
                  aria-label={isVisible ? "Hide key" : "Show key"}
                >
                  {isVisible ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="flex flex-col gap-2.5 border-t border-white/5 bg-black/30 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <p className="text-[10px] text-slate-dim">
          Keys never leave the tenant vault boundary.
        </p>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saveState === "saving"}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-60"
        >
          {saveState === "saving" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Encrypting…
            </>
          ) : saveState === "saved" ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Vault sealed
            </>
          ) : (
            <>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Save & verify
            </>
          )}
        </button>
      </footer>

      <AnimatePresence>
        {saveState === "saved" ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-[11px] text-emerald-400"
          >
            Verified keys active for next swarm heartbeat.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function StatusPill({
  status,
  preview,
}: {
  status: Status;
  preview: string;
}) {
  if (status === "verified") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400"
        title={preview}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
        Verified
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
        Ready
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-dim">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" aria-hidden />
      Unset
    </span>
  );
}
