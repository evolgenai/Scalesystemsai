"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, Lock, Sparkles } from "lucide-react";
import {
  AGENT_PERSONA_PRESETS,
  PERSONA_ACCENT_CLASSES,
} from "@/lib/agents/personaPresets";
import { requestOpenAuth } from "@/lib/auth/pendingCheckout";

type AgentPersonaSelectorProps = {
  personaId: string;
  onPersonaChange: (personaId: string) => void;
  customSystemPrompt: string;
  onCustomSystemPromptChange: (value: string) => void;
  /** When true, cards stay visible but selection is gated behind sign-in. */
  locked?: boolean;
  /** Env-driven OVERLORD bypass badge (server-passed). */
  isSuperAdmin?: boolean;
};

export default function AgentPersonaSelector({
  personaId,
  onPersonaChange,
  customSystemPrompt,
  onCustomSystemPromptChange,
  locked = false,
  isSuperAdmin = false,
}: AgentPersonaSelectorProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const customPanelId = useId();
  const customOverrideActive = customSystemPrompt.trim().length > 0;

  const promptUnlock = (mode: "signin" | "signup" = "signin") => {
    requestOpenAuth({ mode });
  };

  return (
    <div className="relative w-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-dim">
          Agent personality
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
              Overlord bypass
            </span>
          ) : null}
          {customOverrideActive && !locked ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
              <Sparkles className="h-3 w-3" aria-hidden />
              Custom override
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative">
        {locked ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
            <div
              role="status"
              className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-cyan-accent/35 bg-black/85 px-5 py-4 text-center shadow-[0_0_28px_rgba(0,242,254,0.18)] backdrop-blur-md"
            >
              <p className="text-[12px] font-medium leading-snug text-cyan-accent">
                🔒 Sign in to unlock custom personalities
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => promptUnlock("signin")}
                  className="rounded-lg border border-cyan-accent/40 bg-cyan-accent/15 px-3 py-1.5 text-[11px] font-semibold text-cyan-accent transition hover:bg-cyan-accent/25"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => promptUnlock("signup")}
                  className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                >
                  Sign up
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div
          aria-disabled={locked}
          className={
            locked
              ? "relative opacity-60 saturate-50 pointer-events-none filter blur-[0.5px] transition-all"
              : "relative transition-all"
          }
        >
          <div
            role="listbox"
            aria-label="Persona templates"
            aria-disabled={locked}
            className="flex w-full flex-wrap gap-4"
          >
            {AGENT_PERSONA_PRESETS.map((persona) => {
              const Icon = persona.icon;
              const accent = PERSONA_ACCENT_CLASSES[persona.accent];
              const selected =
                !locked && personaId === persona.id && !customOverrideActive;

              return (
                <button
                  key={persona.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={locked ? -1 : 0}
                  onClick={() => {
                    if (locked) return;
                    onPersonaChange(persona.id);
                    if (customSystemPrompt.trim()) {
                      onCustomSystemPromptChange("");
                    }
                  }}
                  className={`group relative min-w-[240px] flex-1 overflow-hidden rounded-xl border bg-black/35 p-4 text-left transition-all duration-300 ${accent.border} ${accent.glow} ${
                    selected
                      ? `${accent.borderActive} bg-white/[0.04] ring-1 ${accent.ring} shadow-[0_0_24px_rgba(0,242,254,0.12)]`
                      : "opacity-90"
                  } ${customOverrideActive ? "opacity-55" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${accent.iconWrap}`}
                    >
                      <Icon className={`h-4 w-4 ${accent.icon}`} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-start justify-between gap-2">
                        <p className="whitespace-normal break-words text-sm font-semibold leading-snug text-white">
                          {persona.title}
                        </p>
                        {selected ? (
                          <Check
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${accent.icon}`}
                            aria-hidden
                          />
                        ) : null}
                        {locked ? (
                          <Lock
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-dim"
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      <p className="mt-1.5 whitespace-normal break-words text-xs leading-relaxed text-slate-dim">
                        {persona.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/30">
            <button
              type="button"
              aria-expanded={customOpen && !locked}
              aria-controls={customPanelId}
              tabIndex={locked ? -1 : 0}
              onClick={() => {
                if (locked) return;
                setCustomOpen((open) => !open);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-white/[0.03]"
            >
              <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-muted">
                {locked ? <Lock className="h-3 w-3" aria-hidden /> : null}
                Toggle Custom System Instructions
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-dim transition ${
                  customOpen && !locked ? "rotate-180 text-cyan-accent" : ""
                }`}
                aria-hidden
              />
            </button>

            {customOpen && !locked ? (
              <div
                id={customPanelId}
                className="border-t border-white/10 px-3 pb-3 pt-2"
              >
                <p className="mb-2 text-[10px] leading-relaxed text-slate-dim">
                  Advanced: your prompt overrides the selected personality
                  template for this launch.
                </p>
                <textarea
                  value={customSystemPrompt}
                  onChange={(e) => onCustomSystemPromptChange(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-accent/40 focus:ring-1 focus:ring-cyan-accent/20"
                  placeholder="You are a specialized agent that…"
                  spellCheck={false}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
