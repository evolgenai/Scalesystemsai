"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, Search, Sparkles, X } from "lucide-react";
import type { SynthesizedSkill } from "@/lib/memory/synthesizedSkills";
import { SKILL_LIBRARY_OPEN_EVENT } from "@/lib/spatial/swarmEvents";
import { playSpatialCue } from "@/lib/spatial/spatialAudio";

type SkillsResponse = {
  success?: boolean;
  skills?: SynthesizedSkill[];
  library?: { counts: { builtin: number; synthesized: number; total: number } };
  error?: string;
};

/**
 * Interactive viewer for auto-synthesized + builtin skills.
 */
export default function SkillLibraryModal() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SynthesizedSkill[]>([]);
  const [q, setQ] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [counts, setCounts] = useState({
    builtin: 0,
    synthesized: 0,
    total: 0,
  });

  const load = useCallback(async (query?: string) => {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: "40" });
      if (query?.trim()) qs.set("q", query.trim());
      const res = await fetch(`/api/memory/skills?${qs}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as SkillsResponse;
      if (!res.ok || !json.skills) {
        throw new Error(json.error ?? "Skill library unavailable");
      }
      setSkills(json.skills);
      if (json.library?.counts) setCounts(json.library.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      playSpatialCue("unlock");
    };
    window.addEventListener(SKILL_LIBRARY_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SKILL_LIBRARY_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load(q);
  }, [open, load]); // eslint-disable-line react-hooks/exhaustive-deps -- search via submit

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        s.description.toLowerCase().includes(needle) ||
        s.tags.some((t) => t.toLowerCase().includes(needle))
    );
  }, [skills, q]);

  const copyPayload = async (skill: SynthesizedSkill) => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(skill.payload, null, 2)
      );
      setCopiedId(skill.id);
      playSpatialCue("deploy");
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      setError("Clipboard unavailable");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="skill-library-title"
        className="flex max-h-[min(88vh,740px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#00ffaa]/25 bg-gradient-to-b from-[#0b120f] to-[#121e18] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_24px_48px_-18px_rgba(0,0,0,0.85)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div>
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#00ffaa]/80">
              <Sparkles className="h-3 w-3" aria-hidden />
              synthesized skill library
            </p>
            <h2
              id="skill-library-title"
              className="text-sm font-semibold text-white"
            >
              Skills · {counts.total} visible
            </h2>
            <p className="font-mono text-[10px] text-slate-dim">
              builtin {counts.builtin} · synthesized {counts.synthesized}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Close skill library"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void load(q);
          }}
        >
          <Search className="h-3.5 w-3.5 text-slate-dim" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search skills…"
            className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-white outline-none placeholder:text-slate-dim"
            aria-label="Search skills"
          />
          <button
            type="submit"
            className="rounded-lg border border-[#00ffaa]/30 px-2.5 py-1 font-mono text-[10px] text-[#00ffaa] transition hover:bg-[#00ffaa]/10"
          >
            Search
          </button>
        </form>

        <div className="terminal-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {busy && skills.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 font-mono text-xs text-slate-muted">
              <Loader2 className="h-4 w-4 animate-spin text-[#00ffaa]" />
              loading skills…
            </div>
          ) : null}
          {error ? (
            <p className="mb-2 font-mono text-[11px] text-red-400">{error}</p>
          ) : null}
          <ul className="space-y-2.5">
            {filtered.map((skill) => (
              <li
                key={skill.id}
                className="rounded-xl border border-white/5 bg-[#050807]/55 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-white">
                      {skill.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] text-slate-dim">
                      {skill.id} · {skill.source} · v{skill.version} · conf{" "}
                      {(skill.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyPayload(skill)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#00ffaa]/30 bg-[#00ffaa]/10 px-2 py-1 font-mono text-[10px] text-[#00ffaa] transition hover:bg-[#00ffaa]/20"
                  >
                    {copiedId === skill.id ? (
                      <Check className="h-3 w-3" aria-hidden />
                    ) : (
                      <Copy className="h-3 w-3" aria-hidden />
                    )}
                    {copiedId === skill.id ? "Copied" : "Copy payload"}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                  {skill.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {skill.tags.slice(0, 6).map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-slate-dim"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <pre className="mt-2 max-h-24 overflow-auto rounded-lg border border-white/5 bg-[#0b120f]/8 p-2 font-mono text-[9px] text-slate-muted">
                  {JSON.stringify(skill.payload, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
          {!busy && filtered.length === 0 ? (
            <p className="py-10 text-center font-mono text-[11px] text-slate-dim">
              No skills match this query.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
