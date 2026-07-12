"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { useState } from "react";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/contact", label: "Contact" },
];

const authLinks = [
  { href: "/login", label: "Sign In" },
  { href: "/register", label: "Sign Up" },
];

function linkClassName(pathname: string, href: string) {
  const active = pathname === href;
  return `text-sm font-medium transition-colors hover:text-cyan-accent ${
    active ? "text-cyan-accent" : "text-slate-muted"
  }`;
}

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full px-4 pt-4 sm:px-6 lg:px-8">
      <nav
        className="glass mx-auto flex max-w-7xl items-center justify-between rounded-2xl px-4 py-4 sm:px-6"
        aria-label="Main navigation"
      >
        <Link href="/" className="group flex shrink-0 items-center gap-2">
          <span className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            <span className="text-gradient drop-shadow-[0_0_12px_rgba(0,242,254,0.4)]">
              ScaleSystems
            </span>
          </span>
        </Link>

        <ul className="hidden items-center gap-6 lg:flex xl:gap-8">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className={linkClassName(pathname, link.href)}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          {authLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={linkClassName(pathname, link.href)}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/dashboard">
            <motion.span
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-cyan-accent/40 hover:text-cyan-accent"
            >
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
              Portal
            </motion.span>
          </Link>
          <Link href="/contact">
            <motion.span
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center rounded-lg bg-cyan-accent px-5 py-2.5 text-sm font-semibold text-obsidian shadow-glow-sm transition-shadow hover:shadow-glow"
            >
              Hire an AI Employee
            </motion.span>
          </Link>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-slate-muted lg:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-expanded={mobileOpen}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass mx-auto mt-2 max-w-7xl rounded-2xl border-t border-white/5 px-4 py-4 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            <li className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
              Navigate
            </li>
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={closeMobile}
                  className={`block rounded-lg px-3 py-2.5 ${linkClassName(pathname, link.href)}`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <ul className="mt-4 flex flex-col gap-1 border-t border-white/10 pt-4">
            <li className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
              Account
            </li>
            {authLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={closeMobile}
                  className={`block rounded-lg px-3 py-2.5 ${linkClassName(pathname, link.href)}`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
            <Link
              href="/dashboard"
              onClick={closeMobile}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden />
              Client Portal
            </Link>
            <Link
              href="/contact"
              onClick={closeMobile}
              className="inline-flex w-full justify-center rounded-lg bg-cyan-accent px-5 py-2.5 text-sm font-semibold text-obsidian"
            >
              Hire an AI Employee
            </Link>
          </div>
        </motion.div>
      )}
    </header>
  );
}
