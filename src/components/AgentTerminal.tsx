'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

const AGENT_LOGS = [
  { system: 'SYSTEM', msg: 'Initializing ScaleSystems Agentic Nexus v4.6...', color: 'text-cyan-400' },
  { system: 'ROUTING', msg: 'Establishing encrypted multi-node data streams...', color: 'text-slate-400' },
  { system: 'SENTINEL-01', msg: 'Active task: Scanning decentralized channels for market spreads...', color: 'text-amber-400' },
  { system: 'SENTINEL-01', msg: 'Arbitrage matrix updated: Asset alpha/beta/gamma tracked successfully.', color: 'text-emerald-400' },
  { system: 'LEAD-GEN', msg: 'Deploying autonomous target web scrapers for B2B logistics clients...', color: 'text-cyan-400' },
  { system: 'LEAD-GEN', msg: 'Extracted 14 high-intent leads; parsing operational bottlenecks...', color: 'text-cyan-400' },
  { system: 'AUTOMATION', msg: 'Webhook triggered: Injecting qualified client records into HubSpot CRM.', color: 'text-purple-400' },
  { system: 'AI-WORKER', msg: 'Dispatched automated semantic follow-up email sequence via SendGrid.', color: 'text-blue-400' },
  { system: 'SYSTEM', msg: 'Cycle completed. Optimization metric: 11.4 human-hours mitigated.', color: 'text-emerald-400' },
];

export default function AgentTerminal() {
  const [logs, setLogs] = useState<typeof AGENT_LOGS>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentIndex < AGENT_LOGS.length) {
      const timeout = setTimeout(() => {
        setLogs((prev) => [...prev, AGENT_LOGS[currentIndex]]);
        setCurrentIndex((prev) => prev + 1);
      }, 1500); // Speed of logs printing
      return () => clearTimeout(timeout);
    } else {
      // Loop logs infinitely to keep the site feeling alive 24/7
      const resetTimeout = setTimeout(() => {
        setLogs([]);
        setCurrentIndex(0);
      }, 4000);
      return () => clearTimeout(resetTimeout);
    }
  }, [currentIndex]);

  useEffect(() => {
    if (terminalEndRef.current) {
      const container = terminalEndRef.current.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [logs]);

  return (
    <div className="w-full max-w-4xl mx-auto my-12 bg-[#09090b] border border-cyan-500/20 rounded-xl overflow-hidden shadow-[0_0_30px_rgba(0,242,254,0.05)]">
      {/* Window Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#121214] border-b border-cyan-500/10">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono tracking-wider text-slate-400 uppercase">Live Agent Core Engine Logs</span>
        </div>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
        </div>
      </div>

      {/* Terminal View */}
      <div className="p-6 font-mono text-sm h-72 overflow-y-auto space-y-2 bg-[#050507]">
        {logs.map((log, idx) => (
          <div key={idx} className="flex items-start gap-2 leading-relaxed animate-fadeIn">
            <span className="text-cyan-500/50 select-none">&gt;</span>
            <span className={`font-bold tracking-wide shrink-0 ${log.color}`}>[{log.system}]</span>
            <span className="text-slate-300">{log.msg}</span>
          </div>
        ))}
        
        {currentIndex < AGENT_LOGS.length && (
          <div className="flex items-center gap-1 text-cyan-400 animate-pulse">
            <span className="text-cyan-500/50">&gt;</span>
            <div className="w-2 h-4 bg-cyan-400" />
          </div>
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-3 border-t border-cyan-500/10 bg-[#0d0d11] text-center divide-x divide-cyan-500/10 py-4">
        <div>
          <p className="text-[10px] uppercase font-mono tracking-widest text-slate-500">Agent Efficiency</p>
          <p className="text-lg font-bold font-mono text-cyan-400 mt-0.5">99.84%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase font-mono tracking-widest text-slate-500">Active Nodes</p>
          <p className="text-lg font-bold font-mono text-emerald-400 mt-0.5">03 / Online</p>
        </div>
        <div>
          <p className="text-[10px] uppercase font-mono tracking-widest text-slate-500">Cost/Task Avg</p>
          <p className="text-lg font-bold font-mono text-purple-400 mt-0.5">$0.00 / hr</p>
        </div>
      </div>
    </div>
  );
}