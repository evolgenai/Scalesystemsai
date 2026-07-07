"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Terminal } from "lucide-react";

type FeedEntry = {
  id: string;
  agent: string;
  message: string;
  timestamp: string;
  tone: "cyan" | "purple" | "emerald" | "amber";
};

const FEED_POOL: Omit<FeedEntry, "id" | "timestamp">[] = [
  {
    agent: "Lead Sentinel",
    message: "Scraped inbound profile for Acme Corp — Intent Score: 94%",
    tone: "cyan",
  },
  {
    agent: "Systems Orchestrator",
    message: "Synced 847 records from Salesforce → HubSpot pipeline",
    tone: "purple",
  },
  {
    agent: "Support Specialist",
    message: "Resolved ticket #4821 — API timeout root cause identified",
    tone: "emerald",
  },
  {
    agent: "Lead Sentinel",
    message: "Enriched contact at NovaTech via Clearbit — ICP match: 91%",
    tone: "cyan",
  },
  {
    agent: "Systems Orchestrator",
    message: "Triggered Slack escalation for invoice reconciliation anomaly",
    tone: "purple",
  },
  {
    agent: "Lead Sentinel",
    message: "Dispatched personalized outreach sequence to 12 qualified leads",
    tone: "cyan",
  },
  {
    agent: "Support Specialist",
    message: "Escalated L2 issue to engineering with reproduction map attached",
    tone: "amber",
  },
  {
    agent: "Systems Orchestrator",
    message: "Completed nightly database migration validation — 0 errors",
    tone: "purple",
  },
  {
    agent: "Lead Sentinel",
    message: "Cross-referenced CRM vectors for Meridian Logistics — Score: 88%",
    tone: "cyan",
  },
  {
    agent: "Support Specialist",
    message: "Answered 23 tier-1 inquiries from knowledge base in 0.9s avg",
    tone: "emerald",
  },
];

const TONE_CLASSES: Record<FeedEntry["tone"], string> = {
  cyan: "text-cyan-accent",
  purple: "text-purple-400",
  emerald: "text-emerald-400",
  amber: "text-amber-400",
};

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

let feedCounter = 0;

export default function LiveIntegrationFeed() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      const template = FEED_POOL[index % FEED_POOL.length];
      const entry: FeedEntry = {
        ...template,
        id: `feed-${++feedCounter}`,
        timestamp: formatTime(new Date()),
      };
      setEntries((prev) => [...prev.slice(-24), entry]);
      index += 1;
    }, 2200);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Live System Integration Feed
          </h2>
          <p className="mt-1 text-sm text-slate-muted">
            Real-time background worker execution stream
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5">
          <Radio className="h-3 w-3 animate-pulse text-emerald-400" aria-hidden />
          <span className="text-[11px] font-medium text-emerald-400">Streaming</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#050507] shadow-[0_0_30px_rgba(0,242,254,0.04)]">
        <div className="flex items-center justify-between border-b border-white/10 bg-[#0d0d11] px-4 py-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-cyan-accent" aria-hidden />
            <span className="font-mono text-xs text-slate-muted">
              runtime-worker-stream
            </span>
          </div>
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/50" />
          </div>
        </div>

        <div
          ref={scrollRef}
          className="h-64 overflow-y-auto p-4 font-mono text-xs sm:h-72 sm:text-sm"
        >
          {entries.length === 0 && (
            <p className="text-slate-dim animate-pulse">
              Awaiting worker heartbeat...
            </p>
          )}
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="mb-2 flex items-start gap-2 leading-relaxed"
              >
                <span className="shrink-0 text-slate-dim select-none">
                  {entry.timestamp}
                </span>
                <span className="text-slate-dim select-none">&gt;</span>
                <span
                  className={`shrink-0 font-semibold ${TONE_CLASSES[entry.tone]}`}
                >
                  [{entry.agent}]
                </span>
                <span className="text-slate-300">{entry.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="border-t border-white/5 bg-black/40 px-4 py-2 font-mono text-[10px] text-slate-dim sm:text-xs">
          Events buffered:{" "}
          <span className="text-cyan-accent">{entries.length}</span> · Throughput:{" "}
          <span className="text-purple-400">~27 events/min</span>
        </div>
      </div>
    </section>
  );
}
