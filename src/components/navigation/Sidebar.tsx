"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  CreditCard,
  BookOpen,
  ScrollText,
  Menu,
  X,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Core Workspace",
    icon: LayoutDashboard,
  },
  {
    href: "/dashboard/metrics",
    label: "Token Analytics Grid",
    icon: BarChart3,
  },
  {
    href: "/dashboard/billing",
    label: "Billing Portal",
    icon: CreditCard,
  },
  {
    href: "/docs/developer-guide",
    label: "Developer System Docs",
    icon: BookOpen,
  },
  {
    href: "/status/incident-log",
    label: "System Incident Logs",
    icon: ScrollText,
  },
] as const;

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive
          ? "border-l-2 border-l-cyan-accent bg-cyan-accent/10 text-cyan-accent"
          : "text-slate-muted hover:bg-white/[0.04] hover:text-white"
      }`}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${
          isActive ? "text-cyan-accent" : "text-slate-dim group-hover:text-slate-muted"
        }`}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SidebarNav({
  onNavigate,
  className = "",
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={className} aria-label="Workspace navigation">
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <NavLink
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={pathname === item.href}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-obsidian/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-cyan-accent" aria-hidden />
          <span className="font-display text-sm font-bold tracking-tight">
            Scale<span className="text-cyan-accent">Systems</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          className="rounded-lg border border-white/10 p-2 text-slate-muted transition-colors hover:bg-white/[0.04] hover:text-white"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

      {/* Mobile slide-out panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/10 bg-obsidian transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2"
            onClick={() => setMobileOpen(false)}
          >
            <Bot className="h-5 w-5 text-cyan-accent" aria-hidden />
            <span className="font-display text-sm font-bold tracking-tight">
              Scale<span className="text-cyan-accent">Systems</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-slate-muted transition-colors hover:bg-white/[0.04] hover:text-white"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-white/10 lg:bg-obsidian">
        <div className="border-b border-white/10 px-5 py-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Bot className="h-6 w-6 text-cyan-accent" aria-hidden />
            <span className="font-display text-lg font-bold tracking-tight">
              Scale<span className="text-cyan-accent">Systems</span>
            </span>
          </Link>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate-dim">
            Workspace
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav />
        </div>
        <div className="border-t border-white/10 px-4 py-3">
          <p className="text-[10px] text-slate-dim">
            v4.6 ·{" "}
            <span className="font-mono text-emerald-400">operational</span>
          </p>
        </div>
      </aside>
    </>
  );
}
