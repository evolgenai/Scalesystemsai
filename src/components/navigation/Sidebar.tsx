"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  X,
  LayoutDashboard,
  Store,
  type LucideIcon,
} from "lucide-react";
import { useNavDrawer } from "@/components/navigation/NavDrawerContext";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

const NAV_LINKS: {
  href: string;
  label: string;
  icon?: LucideIcon;
  match?: "exact" | "dashboard" | "marketplace";
}[] = [
  { href: "/", label: "Home", match: "exact" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Documentation" },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    match: "dashboard",
  },
  {
    href: "/dashboard?view=marketplace",
    label: "Marketplace",
    icon: Store,
    match: "marketplace",
  },
  { href: "/analytics", label: "Analytics" },
  { href: "/checkout", label: "Checkout" },
  { href: "/contact", label: "Contact" },
];

function linkClassName(active: boolean): string {
  return `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? "bg-emerald-500/15 text-emerald-400"
      : "text-slate-muted hover:bg-white/5 hover:text-white"
  }`;
}

function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setOpen } = useNavDrawer();
  const marketplaceOpen =
    pathname.startsWith("/dashboard") &&
    searchParams.get("view") === "marketplace";

  const closeDrawer = () => setOpen(false);

  const isActive = (link: (typeof NAV_LINKS)[number]): boolean => {
    if (link.match === "exact") return pathname === "/";
    if (link.match === "marketplace") return marketplaceOpen;
    if (link.match === "dashboard") {
      return pathname.startsWith("/dashboard") && !marketplaceOpen;
    }
    const pathOnly = link.href.split("?")[0] ?? link.href;
    return pathname.startsWith(pathOnly);
  };

  return (
    <nav
      className="flex-1 space-y-0.5 overflow-y-auto p-3"
      aria-label="Sidebar navigation"
    >
      {NAV_LINKS.map((link) => {
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={closeDrawer}
            className={linkClassName(isActive(link))}
          >
            {Icon ? (
              <Hover3DIcon intensity={14}>
                <Icon className="h-4 w-4" aria-hidden />
              </Hover3DIcon>
            ) : null}
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Sidebar() {
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

        <Suspense
          fallback={
            <nav className="flex-1 space-y-0.5 p-3" aria-hidden>
              {NAV_LINKS.map((link) => (
                <div
                  key={link.href}
                  className="h-9 animate-pulse rounded-lg bg-white/[0.03]"
                />
              ))}
            </nav>
          }
        >
          <SidebarNav />
        </Suspense>
      </aside>
    </>
  );
}
