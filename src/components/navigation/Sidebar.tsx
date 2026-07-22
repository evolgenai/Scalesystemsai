"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  X,
  LayoutDashboard,
  Store,
  Plug,
  BellRing,
  ClipboardList,
  Settings2,
  Radio,
  Flame,
  Box,
  Shield,
  ShoppingBag,
  Package,
  HeartPulse,
  GitFork,
  Terminal,
  Globe,
  ShieldCheck,
  Users,
  Crown,
  Layers,
  Webhook,
  BarChart3,
  Gift,
  type LucideIcon,
} from "lucide-react";
import { useNavDrawer } from "@/components/navigation/NavDrawerContext";
import { useWorkspaceModeOptional } from "@/components/dashboard/ModeWrapper";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type NavLink = {
  href: string;
  label: string;
  icon?: LucideIcon;
  match?:
    | "exact"
    | "dashboard"
    | "marketplace"
    | "plugins"
    | "alerts"
    | "audit"
    | "settings"
    | "teletraffic"
    | "chaos"
    | "universe"
    | "sre-control"
    | "catalog"
    | "inventory"
    | "sre-health"
    | "builder"
    | "cli"
    | "domains"
    | "security"
    | "team"
    | "billing"
    | "integrations"
    | "webhooks"
    | "analytics"
    | "affiliate";
  /** Only shown in Developer mode on dashboard surfaces. */
  developerOnly?: boolean;
  /** Only shown when Super-Admin env bypass is armed. */
  superAdminOnly?: boolean;
};

const NAV_LINKS: NavLink[] = [
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
  {
    href: "/dashboard?view=plugins",
    label: "Plugins",
    icon: Plug,
    match: "plugins",
    developerOnly: true,
  },
  {
    href: "/dashboard?view=alerts",
    label: "Alerts",
    icon: BellRing,
    match: "alerts",
  },
  {
    href: "/dashboard?view=teletraffic",
    label: "Teletraffic",
    icon: Radio,
    match: "teletraffic",
    developerOnly: true,
  },
  {
    href: "/dashboard?view=chaos",
    label: "Chaos Testing",
    icon: Flame,
    match: "chaos",
    developerOnly: true,
  },
  {
    href: "/dashboard?view=universe",
    label: "Universe",
    icon: Box,
    match: "universe",
    developerOnly: true,
  },
  {
    href: "/dashboard?view=sre-control",
    label: "SRE Control",
    icon: Shield,
    match: "sre-control",
    superAdminOnly: true,
  },
  {
    href: "/dashboard?view=builder",
    label: "Workflow Builder",
    icon: GitFork,
    match: "builder",
  },
  {
    href: "/dashboard?view=cli",
    label: "CLI Integration",
    icon: Terminal,
    match: "cli",
    developerOnly: true,
  },
  {
    href: "/dashboard?view=domains",
    label: "Domains & Branding",
    icon: Globe,
    match: "domains",
  },
  {
    href: "/dashboard?view=team",
    label: "Team Members",
    icon: Users,
    match: "team",
  },
  {
    href: "/dashboard?view=integrations",
    label: "Integrations Hub",
    icon: Layers,
    match: "integrations",
  },
  {
    href: "/dashboard?view=webhooks",
    label: "Inbound Webhooks",
    icon: Webhook,
    match: "webhooks",
  },
  {
    href: "/dashboard?view=analytics",
    label: "Analytics",
    icon: BarChart3,
    match: "analytics",
  },
  {
    href: "/dashboard?view=affiliate",
    label: "Affiliate Program",
    icon: Gift,
    match: "affiliate",
  },
  {
    href: "/dashboard?view=billing",
    label: "Upgrade Workspace",
    icon: Crown,
    match: "billing",
  },
  {
    href: "/catalog",
    label: "Catalog",
    icon: ShoppingBag,
    match: "catalog",
  },
  {
    href: "/dashboard?view=inventory",
    label: "Inventory",
    icon: Package,
    match: "inventory",
    superAdminOnly: true,
  },
  {
    href: "/dashboard?view=sre-health",
    label: "SRE Health",
    icon: HeartPulse,
    match: "sre-health",
    superAdminOnly: true,
  },
  {
    href: "/dashboard?view=security",
    label: "Security Vault",
    icon: ShieldCheck,
    match: "security",
    superAdminOnly: true,
  },
  {
    href: "/dashboard?view=audit",
    label: "Audit",
    icon: ClipboardList,
    match: "audit",
    developerOnly: true,
  },
  {
    href: "/dashboard?view=settings",
    label: "Settings",
    icon: Settings2,
    match: "settings",
  },
  { href: "/checkout", label: "Checkout" },
  { href: "/contact", label: "Contact" },
];

function linkClassName(active: boolean): string {
  return `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? "border border-[#00ffaa]/25 bg-[#00ffaa]/10 text-[#00ffaa] shadow-glow-sm"
      : "border border-transparent text-slate-muted hover:bg-bio-gunmetal/80 hover:text-white"
  }`;
}

function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setOpen } = useNavDrawer();
  const { isDeveloper, mode } = useWorkspaceModeOptional();
  const onDashboard = pathname.startsWith("/dashboard");
  const view = searchParams.get("view");
  const [superAdminUi, setSuperAdminUi] = useState(false);

  useEffect(() => {
    try {
      setSuperAdminUi(
        window.localStorage.getItem("scalesystems.ui.superAdmin") === "1"
      );
    } catch {
      setSuperAdminUi(false);
    }
  }, [pathname, view]);

  const marketplaceOpen = onDashboard && view === "marketplace";
  const pluginsOpen = onDashboard && view === "plugins";
  const alertsOpen = onDashboard && view === "alerts";
  const auditOpen = onDashboard && view === "audit";
  const settingsOpen = onDashboard && view === "settings";
  const teletrafficOpen = onDashboard && view === "teletraffic";
  const chaosOpen = onDashboard && view === "chaos";
  const universeOpen = onDashboard && view === "universe";
  const sreControlOpen = onDashboard && view === "sre-control";
  const builderOpen = onDashboard && view === "builder";
  const cliOpen = onDashboard && view === "cli";
  const domainsOpen = onDashboard && view === "domains";
  const catalogOpen =
    pathname === "/catalog" || pathname.startsWith("/catalog/") || (onDashboard && view === "catalog");
  const inventoryOpen = onDashboard && view === "inventory";
  const sreHealthOpen = onDashboard && view === "sre-health";
  const securityOpen = onDashboard && view === "security";
  const teamOpen = onDashboard && view === "team";
  const integrationsOpen = onDashboard && view === "integrations";
  const webhooksOpen = onDashboard && view === "webhooks";
  const analyticsOpen = onDashboard && view === "analytics";
  const affiliateOpen = onDashboard && view === "affiliate";
  const billingOpen = onDashboard && view === "billing";

  const closeDrawer = () => setOpen(false);

  const visibleLinks = NAV_LINKS.filter((link) => {
    if (link.superAdminOnly) {
      if (!onDashboard) return false;
      return superAdminUi;
    }
    if (!link.developerOnly) return true;
    if (!onDashboard) return false;
    return isDeveloper;
  });

  const isActive = (link: NavLink): boolean => {
    if (link.match === "exact") return pathname === "/";
    if (link.match === "marketplace") return marketplaceOpen;
    if (link.match === "plugins") return pluginsOpen;
    if (link.match === "alerts") return alertsOpen;
    if (link.match === "audit") return auditOpen;
    if (link.match === "settings") return settingsOpen;
    if (link.match === "teletraffic") return teletrafficOpen;
    if (link.match === "chaos") return chaosOpen;
    if (link.match === "universe") return universeOpen;
    if (link.match === "sre-control") return sreControlOpen;
    if (link.match === "builder") return builderOpen;
    if (link.match === "cli") return cliOpen;
    if (link.match === "domains") return domainsOpen;
    if (link.match === "catalog") return catalogOpen;
    if (link.match === "inventory") return inventoryOpen;
    if (link.match === "sre-health") return sreHealthOpen;
    if (link.match === "security") return securityOpen;
    if (link.match === "team") return teamOpen;
    if (link.match === "integrations") return integrationsOpen;
    if (link.match === "webhooks") return webhooksOpen;
    if (link.match === "analytics") return analyticsOpen;
    if (link.match === "affiliate") return affiliateOpen;
    if (link.match === "billing") return billingOpen;
    if (link.match === "dashboard") {
      return (
        onDashboard &&
        !marketplaceOpen &&
        !pluginsOpen &&
        !alertsOpen &&
        !auditOpen &&
        !settingsOpen &&
        !teletrafficOpen &&
        !chaosOpen &&
        !universeOpen &&
        !sreControlOpen &&
        !builderOpen &&
        !cliOpen &&
        !domainsOpen &&
        !catalogOpen &&
        !inventoryOpen &&
        !sreHealthOpen &&
        !securityOpen &&
        !teamOpen &&
        !integrationsOpen &&
        !webhooksOpen &&
        !analyticsOpen &&
        !affiliateOpen &&
        !billingOpen
      );
    }
    const pathOnly = link.href.split("?")[0] ?? link.href;
    return pathname.startsWith(pathOnly);
  };

  return (
    <nav
      className="flex-1 space-y-0.5 overflow-y-auto p-3"
      aria-label="Sidebar navigation"
    >
      {onDashboard ? (
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-[#00ffaa]/80">
          {mode === "USER" ? "User nav" : "Developer nav"}
        </p>
      ) : null}
      {visibleLinks.map((link) => {
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
  const pathname = usePathname();
  const { open, setOpen } = useNavDrawer();
  const { isUser } = useWorkspaceModeOptional();
  const onDashboard = pathname.startsWith("/dashboard");

  const closeDrawer = () => setOpen(false);

  useEffect(() => {
    if (!onDashboard && open) setOpen(false);
  }, [onDashboard, open, setOpen]);

  if (!onDashboard) return null;

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
        className={`fixed inset-y-0 left-0 z-50 hidden w-[min(18rem,88vw)] flex-col border-r border-bio-moss/50 bg-gradient-to-b from-slate-950 via-bio-gunmetal to-bio-moss/40 backdrop-blur-xl transition-transform duration-300 ease-out md:flex xl:static xl:z-auto xl:w-64 xl:shrink-0 xl:translate-x-0 xl:border-bio-moss/40 ${
          open
            ? "!flex translate-x-0 shadow-2xl shadow-black/60"
            : "-translate-x-full xl:translate-x-0"
        }`}
      >
        <div className="border-b border-bio-moss/40 bg-bio-panel/60 px-5 py-5">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/"
              className="font-display text-lg font-bold text-white"
              onClick={closeDrawer}
            >
              Scale<span className="text-[#00ffaa]">Systems</span>
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
          <p className="mt-1 text-xs text-slate-dim">
            {isUser ? "Simple automation plane" : "Agent control plane"}
          </p>
        </div>

        <Suspense
          fallback={
            <nav className="flex-1 space-y-0.5 p-3" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-9 animate-pulse rounded-lg bg-white/5"
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
