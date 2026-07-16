"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useNavDrawer } from "@/components/navigation/NavDrawerContext";

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
      ? "bg-emerald-500/15 text-emerald-400"
      : "text-slate-muted hover:bg-white/5 hover:text-white"
  }`;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { open, setOpen } = useNavDrawer();

  const closeDrawer = () => setOpen(false);

  return (
    <>
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm xl:hidden"
          onClick={closeDrawer}
          aria-label="Close navigation overlay"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-white/5 bg-[#121212] transition-transform duration-300 ease-out xl:static xl:z-auto xl:w-64 xl:shrink-0 xl:translate-x-0 xl:border-white/10 xl:bg-black/40 ${
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full xl:translate-x-0"
        }`}
      >
        <div className="border-b border-white/5 px-5 py-5">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/"
              className="font-display text-lg font-bold text-white"
              onClick={closeDrawer}
            >
              Scale<span className="text-emerald-400">Systems</span>
            </Link>
            <button
              type="button"
              onClick={closeDrawer}
              className="rounded-lg p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-white xl:hidden"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-dim">Agent control plane</p>
        </div>

        <nav
          className="flex-1 space-y-0.5 overflow-y-auto p-3"
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
