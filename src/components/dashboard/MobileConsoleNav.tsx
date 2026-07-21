"use client";

import { useEffect, useState } from "react";
import { Menu, X, type LucideIcon } from "lucide-react";

export type ConsoleNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  accent?: "emerald" | "rose";
};

type MobileConsoleNavProps = {
  items: ConsoleNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  subtitle?: string;
};

export default function MobileConsoleNav({
  items,
  activeId,
  onSelect,
  subtitle,
}: MobileConsoleNavProps) {
  const [open, setOpen] = useState(false);
  const active = items.find((item) => item.id === activeId);

  useEffect(() => {
    setOpen(false);
  }, [activeId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/5 bg-black/25 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-muted transition hover:text-white"
          aria-label="Open console navigation"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {active?.label ?? "Console"}
          </p>
          {subtitle ? (
            <p className="truncate text-[11px] text-slate-dim">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[32] bg-black/70 backdrop-blur-sm lg:hidden"
          aria-label="Close console navigation"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-[33] flex w-[min(20rem,90vw)] flex-col border-r border-white/10 bg-[#09090B]/95 shadow-2xl backdrop-blur-xl will-change-transform transition-transform duration-300 ease-out lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-4">
          <p className="text-sm font-semibold text-white">Console views</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-lg border border-white/10 text-slate-muted hover:text-white"
            aria-label="Close console navigation"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3" aria-label="Mobile console navigation">
          {items.map((item) => {
            const Icon = item.icon;
            const selected = item.id === activeId;
            const accent = item.accent === "rose";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`flex min-h-[48px] w-full touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                  selected
                    ? accent
                      ? "bg-rose-500/15 text-rose-300"
                      : "bg-emerald-500/15 text-emerald-400"
                    : "text-slate-muted hover:bg-white/5 hover:text-white"
                }`}
                aria-current={selected ? "page" : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
