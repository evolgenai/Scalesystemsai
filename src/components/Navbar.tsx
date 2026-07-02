"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full px-4 pt-4 sm:px-6 lg:px-8">
      <nav
        className="glass mx-auto flex max-w-7xl items-center justify-between rounded-2xl px-4 py-4 sm:px-6"
        aria-label="Main navigation"
      >
        <Link href="/" className="group flex items-center gap-2">
          <span className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            <span className="text-gradient drop-shadow-[0_0_12px_rgba(0,242,254,0.4)]">
              ScaleSystems
            </span>
          </span>
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-cyan-accent ${
                  pathname === link.href ? "text-cyan-accent" : "text-slate-muted"
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden md:block">
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
          className="rounded-lg p-2 text-slate-muted md:hidden"
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
          className="glass mx-auto mt-2 max-w-7xl rounded-2xl border-t border-white/5 px-4 py-4 md:hidden"
        >
          <ul className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block text-sm font-medium text-slate-muted hover:text-cyan-accent"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/contact"
                onClick={() => setMobileOpen(false)}
                className="inline-flex w-full justify-center rounded-lg bg-cyan-accent px-5 py-2.5 text-sm font-semibold text-obsidian"
              >
                Hire an AI Employee
              </Link>
            </li>
          </ul>
        </motion.div>
      )}
    </header>
  );
}
