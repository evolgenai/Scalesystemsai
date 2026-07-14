"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Documentation" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/analytics", label: "Analytics" },
  { href: "/checkout", label: "Checkout" },
  { href: "/contact", label: "Contact" },
];

function linkClassName(active: boolean): string {
  return `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? "bg-cyan-accent/10 text-cyan-accent"
      : "text-slate-muted hover:bg-white/5 hover:text-white"
  }`;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const closeDrawer = () => setIsMobileOpen(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur-xl md:hidden">
        <Link
          href="/"
          className="font-display text-lg font-bold text-white"
          onClick={closeDrawer}
        >
          Scale<span className="text-cyan-accent">Systems</span>
        </Link>
        <button
          type="button"
          onClick={() => setIsMobileOpen((open) => !open)}
          className="rounded-lg border border-white/10 bg-black/30 p-2 text-slate-muted transition-colors hover:border-cyan-accent/30 hover:text-cyan-accent"
          aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMobileOpen}
        >
          {isMobileOpen ? (
            <X className="h-5 w-5" aria-hidden />
          ) : (
            <Menu className="h-5 w-5" aria-hidden />
          )}
        </button>
      </header>

      {isMobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={closeDrawer}
          aria-label="Close navigation overlay"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/10 bg-white/[0.03] backdrop-blur-xl transition-transform duration-300 ease-out md:static md:z-auto md:flex md:w-64 md:shrink-0 md:translate-x-0 md:bg-black/40 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="border-b border-white/10 px-5 py-6">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="font-display text-lg font-bold text-white"
              onClick={closeDrawer}
            >
              Scale<span className="text-cyan-accent">Systems</span>
            </Link>
            <button
              type="button"
              onClick={closeDrawer}
              className="rounded-lg p-1.5 text-slate-muted hover:text-white md:hidden"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-dim">Agent control plane</p>
        </div>

        <nav
          className="flex-1 space-y-1 overflow-y-auto p-4"
          aria-label="Sidebar navigation"
        >
          {NAV_LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeDrawer}
                className={linkClassName(active)}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
