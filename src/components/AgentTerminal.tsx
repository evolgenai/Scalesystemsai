'use client';

import React, { useEffect, useRef } from 'react';
import { Radio, Terminal } from 'lucide-react';
import { useAgentStream } from '@/lib/agents/useAgentStream';
import type { AgentStreamEvent } from '@/lib/agents/streamProtocol';

type AgentTerminalProps = {
  /** Opt into live SSE (`/api/agents/stream`). Defaults to true. */
  live?: boolean;
  className?: string;
};

function stamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--:--';
  }
}

function lineTone(event: AgentStreamEvent): string {
  if (event.type === 'error' || event.status === 'ERROR') return 'text-rose-400';
  if (event.status === 'SUCCESS' || event.type === 'workflow_complete') {
    return 'text-emerald-400';
  }
  if (event.status === 'EXECUTING') return 'text-emerald-300';
  if (event.status === 'THINKING') return 'text-amber-400';
  return 'text-slate-300';
}

export default function AgentTerminal({
  live = true,
  className = '',
}: AgentTerminalProps) {
  const { lines, connection, agents, overallProgress } = useAgentStream({
    enabled: live,
    loop: true,
    objective:
      'Demo cycle: analyze market signals and coordinate specialist agents.',
  });
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  const activeNodes = agents.filter(
    (a) => a.status === 'THINKING' || a.status === 'EXECUTING'
  ).length;

  return (
    <div
      className={`mx-auto my-12 flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-emerald-900/30 bg-[#050d09]/80 shadow-alien backdrop-blur-md ${className}`}
    >
      <div className="flex shrink-0 flex-col justify-between gap-2 border-b border-emerald-900/30 bg-[#040907]/90 px-3 py-3 text-xs xs:flex-row xs:items-center sm:flex-row sm:items-center sm:px-4 sm:text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          <span className="truncate font-mono text-xs uppercase tracking-wider text-slate-400 sm:text-sm">
            Live Agent Core Engine Logs
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="flex items-center gap-1.5">
            <Radio
              className={`h-3 w-3 ${
                connection === 'live'
                  ? 'animate-pulse text-emerald-400'
                  : 'text-slate-500'
              }`}
              aria-hidden
            />
            <span className="font-mono text-[10px] uppercase text-slate-500">
              {connection}
            </span>
          </div>
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
          </div>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="terminal-scroll h-[280px] max-h-[400px] w-full max-w-full space-y-2 overflow-x-auto overflow-y-auto overscroll-contain bg-[#040907] p-3 font-mono text-xs sm:h-[320px] sm:p-6 sm:text-sm"
        role="log"
        aria-live="polite"
      >
        {lines.length === 0 ? (
          <p className="animate-pulse text-slate-500">
            Connecting swarm telemetry…
          </p>
        ) : (
          lines.map((log, idx) => (
            <div
              key={`${log.timestamp}-${idx}`}
              className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-0.5 leading-relaxed"
            >
              <span className="select-none text-emerald-500/50">&gt;</span>
              <span className="shrink-0 text-slate-600">{stamp(log.timestamp)}</span>
              {log.agentName ? (
                <span className="shrink-0 font-bold tracking-wide text-emerald-400">
                  [{log.agentName}]
                </span>
              ) : null}
              <span
                className={`min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words ${lineTone(log)}`}
              >
                {log.message}
              </span>
            </div>
          ))
        )}
        {connection === 'live' && (
          <div className="flex animate-pulse items-center gap-1 text-emerald-400">
            <span className="text-emerald-500/50">&gt;</span>
            <div className="h-4 w-2 bg-emerald-400" />
          </div>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-3 divide-x divide-emerald-900/30 border-t border-emerald-900/30 bg-[#050d09]/90 py-3 text-center sm:py-4">
        <div className="min-w-0 px-1">
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500 sm:text-[10px]">
            Workflow
          </p>
          <p className="mt-0.5 font-mono text-base font-bold text-emerald-400 sm:text-lg">
            {Math.round(overallProgress)}%
          </p>
        </div>
        <div className="min-w-0 px-1">
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500 sm:text-[10px]">
            Active Nodes
          </p>
          <p className="mt-0.5 font-mono text-base font-bold text-emerald-400 sm:text-lg">
            {String(activeNodes).padStart(2, '0')} / Online
          </p>
        </div>
        <div className="min-w-0 px-1">
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500 sm:text-[10px]">
            Cost/Task Avg
          </p>
          <p className="mt-0.5 font-mono text-base font-bold text-slate-300 sm:text-lg">
            $0.00 / hr
          </p>
        </div>
      </div>
    </div>
  );
}
