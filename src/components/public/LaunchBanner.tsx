"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket, X } from "lucide-react";

const DISMISS_KEY = "scalesystems.launchBanner.v2.dismissed";
const HIDDEN_PREFIXES = ["/dashboard", "/checkout", "/settings"];

export default function LaunchBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  const hidden = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (hidden) {
      setVisible(false);
      return;
    }
    try {
      setVisible(window.localStorage.getItem(DISMISS_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, [hidden, pathname]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden border-b border-emerald-500/35 bg-gradient-to-r from-[#05110d] via-[#0a1f18] to-[#05110d]"
          role="region"
          aria-label="Launch announcement"
        >
          <div className="relative flex items-center justify-center gap-3 px-4 py-2.5 sm:px-6">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.18),transparent_70%)]"
              aria-hidden
            />
            <Rocket
              className="relative h-4 w-4 shrink-0 text-emerald-400"
              aria-hidden
            />
            <p className="relative text-center text-xs font-medium tracking-wide text-slate-100 sm:text-sm">
              🚀 Scale Systems v2.0 Live! Claim 10,000 Free Gas Credits
            </p>
            <Link
              href="/dashboard?demo=1"
              className="relative hidden shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500/25 sm:inline-flex"
            >
              Claim now
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-white sm:right-4"
              aria-label="Dismiss launch banner"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
