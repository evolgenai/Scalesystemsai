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
  if (event.status === 'EXECUTING') return 'text-cyan-400';
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
      className={`mx-auto my-12 flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-cyan-500/20 bg-[#040907] shadow-[0_0_30px_rgba(0,242,254,0.05)] ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-cyan-500/10 bg-[#121214] px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-cyan-400" aria-hidden />
          <span className="font-mono text-xs uppercase tracking-wider text-slate-400">
            Live Agent Core Engine Logs
          </span>
        </div>
        <div className="flex items-center gap-3">
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
        className="terminal-scroll h-[320px] max-h-[400px] space-y-2 overflow-y-auto overscroll-contain bg-[#050507] p-6 font-mono text-sm"
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
              className="flex items-start gap-2 leading-relaxed"
            >
              <span className="select-none text-cyan-500/50">&gt;</span>
              <span className="shrink-0 text-slate-600">{stamp(log.timestamp)}</span>
              {log.agentName ? (
                <span className="shrink-0 font-bold tracking-wide text-cyan-400">
                  [{log.agentName}]
                </span>
              ) : null}
              <span className={`break-words ${lineTone(log)}`}>{log.message}</span>
            </div>
          ))
        )}
        {connection === 'live' && (
          <div className="flex animate-pulse items-center gap-1 text-cyan-400">
            <span className="text-cyan-500/50">&gt;</span>
            <div className="h-4 w-2 bg-cyan-400" />
          </div>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-3 divide-x divide-cyan-500/10 border-t border-cyan-500/10 bg-[#0d0d11] py-4 text-center">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Workflow
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold text-cyan-400">
            {Math.round(overallProgress)}%
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Active Nodes
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold text-emerald-400">
            {String(activeNodes).padStart(2, '0')} / Online
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Cost/Task Avg
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold text-slate-300">
            $0.00 / hr
          </p>
        </div>
      </div>
    </div>
  );
}
