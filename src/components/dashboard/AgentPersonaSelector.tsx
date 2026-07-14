"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import {
  AGENT_PERSONA_PRESETS,
  PERSONA_ACCENT_CLASSES,
} from "@/lib/agents/personaPresets";

type AgentPersonaSelectorProps = {
  personaId: string;
  onPersonaChange: (personaId: string) => void;
  customSystemPrompt: string;
  onCustomSystemPromptChange: (value: string) => void;
};

export default function AgentPersonaSelector({
  personaId,
  onPersonaChange,
  customSystemPrompt,
  onCustomSystemPromptChange,
}: AgentPersonaSelectorProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const customPanelId = useId();
  const customOverrideActive = customSystemPrompt.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-dim">
          Agent personality
        </label>
        {customOverrideActive ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
            <Sparkles className="h-3 w-3" aria-hidden />
            Custom override
          </span>
        ) : null}
      </div>

      <div
        role="listbox"
        aria-label="Persona templates"
        className="grid grid-cols-1 gap-4 md:grid-cols-4"
      >
        {AGENT_PERSONA_PRESETS.map((persona) => {
          const Icon = persona.icon;
          const accent = PERSONA_ACCENT_CLASSES[persona.accent];
          const selected = personaId === persona.id && !customOverrideActive;

          return (
            <button
              key={persona.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => {
                onPersonaChange(persona.id);
                if (customSystemPrompt.trim()) {
                  onCustomSystemPromptChange("");
                }
              }}
              className={`group relative rounded-xl border bg-black/35 p-4 text-left transition-all duration-300 ${accent.border} ${accent.glow} ${
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-snug text-white">
                      {persona.title}
                    </p>
                    {selected ? (
                      <Check
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${accent.icon}`}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-dim">
                    {persona.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
        <button
          type="button"
          aria-expanded={customOpen}
          aria-controls={customPanelId}
          onClick={() => setCustomOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-white/[0.03]"
        >
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-muted">
            Toggle Custom System Instructions
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-dim transition ${customOpen ? "rotate-180 text-cyan-accent" : ""}`}
            aria-hidden
          />
        </button>

        {customOpen ? (
          <div
            id={customPanelId}
            className="border-t border-white/10 px-3 pb-3 pt-2"
          >
            <p className="mb-2 text-[10px] leading-relaxed text-slate-dim">
              Advanced: your prompt overrides the selected personality template
              for this launch.
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
  );
}
