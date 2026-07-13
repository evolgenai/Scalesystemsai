import Link from "next/link";
import { Bot, Mail, Linkedin } from "lucide-react";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-obsidian">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
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
              {[
                { href: "/", label: "Home" },
                { href: "/services", label: "Services" },
                { href: "/contact", label: "Contact" },
              ].map((item) => (
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
              Connect
            </h3>
            <ul className="mt-4 space-y-3">
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
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-8 text-center text-xs text-slate-dim">
          © {year} ScaleSystems. All rights reserved. Agentic AI Employees &
          Business Automation.
        </div>
      </div>
    </footer>
  );
}
