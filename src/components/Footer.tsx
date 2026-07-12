import Link from "next/link";
import { Bot, Mail, Linkedin } from "lucide-react";

const navigationLinks = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/contact", label: "Contact" },
];

const platformLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/login", label: "Sign In" },
  { href: "/register", label: "Create Account" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-obsidian">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <Bot className="h-6 w-6 text-cyan-accent" aria-hidden />
              <span className="font-display text-lg font-bold text-gradient">
                ScaleSystems
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-muted">
              Agentic AI Employee & Automation Studio. We design, deploy, and
              maintain autonomous agents that replace repetitive operational
              work with intelligent, always-on workflows.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Navigation
            </h3>
            <ul className="mt-4 space-y-2">
              {navigationLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-slate-muted transition-colors hover:text-cyan-accent"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Platform
            </h3>
            <ul className="mt-4 space-y-2">
              {platformLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-slate-muted transition-colors hover:text-cyan-accent"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <li>
                <a
                  href="mailto:hello@scalesystems.ai"
                  className="flex items-center gap-2 text-sm text-slate-muted transition-colors hover:text-cyan-accent"
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  hello@scalesystems.ai
                </a>
              </li>
              <li>
                <a
                  href="https://linkedin.com/company/scalesystems"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-slate-muted transition-colors hover:text-cyan-accent"
                >
                  <Linkedin className="h-4 w-4" aria-hidden />
                  LinkedIn
                </a>
              </li>
            </ul>
            <p className="text-center text-xs text-slate-dim sm:text-right">
              © {year} ScaleSystems. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
