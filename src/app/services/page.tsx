"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { 
  Bot, 
  Cpu, 
  Database, 
  Network, 
  ShieldCheck, 
  Terminal, 
  Zap, 
  CheckCircle, 
  ArrowRight,
  TrendingUp,
  Workflow
} from "lucide-react";

// Enterprise AI Employee Marketplace Data Structure
const AI_EMPLOYEES = [
  {
    id: "lead-sentinel",
    role: "Lead Qualification Sentinel",
    tagline: "Autonomous Inbound Revenue Pipeline Optimizer",
    description: "Operates 24/7/365 to ingest incoming corporate leads, analyze company sizes, extract decision-maker intent, cross-reference data against internal CRM vectors, and execute personalized outreach blueprints.",
    specs: {
      framework: "LangGraph Multi-Agent Orchestration",
      llm: "Claude 3.5 Sonnet / GPT-4o Hybrid Routing",
      memory: "Pinecone Vector Storage (RAG Architecture)",
      speed: "Sub-2.5s Processing Latency"
    },
    capabilities: [
      "Real-time semantic lead text analysis",
      "B2B enrichment (scrapes LinkedIn, Crunchbase, Clearbit profiles automatically)",
      "Dynamic multi-variable intent scoring engines",
      "Instant synchronization with HubSpot, Salesforce, and custom database webhooks"
    ],
    impact: {
      efficiency: "99.2% Data Extraction Accuracy",
      metric: "Save ~34 Hours/Week per Sales Rep",
      roi: "Zero Lead Drop-off Rate"
    }
  },
  {
    id: "ops-orchestrator",
    role: "Enterprise Systems Orchestrator",
    tagline: "Cross-Platform Data Synchronization & Workflow Automation",
    description: "Replaces fragile, legacy point-to-point API connections with an advanced semantic layer. Monitors your company files, system databases, and communications to securely automate cross-platform work execution without human intervention.",
    specs: {
      framework: "CrewAI Autonomic Execution Framework",
      llm: "Llama 3 70B Fine-Tuned Local Context",
      memory: "Redis Cache + PostgreSQL Persistent State Storage",
      speed: "Event-Driven Real-Time Sync Execution"
    },
    capabilities: [
      "Multi-system database migrations with safety validation protocols",
      "Automated financial reconciliation & invoice ingestion modeling",
      "Autonomous Slack/Teams notification triage and escalation triggers",
      "Secure API token handling with enterprise-grade token rotation loops"
    ],
    impact: {
      efficiency: "99.8% Process Execution Integrity",
      metric: "75% Reduction in Admin Overhead",
      roi: "Eliminates Human Typing Flaws Completely"
    }
  },
  {
    id: "support-specialist",
    role: "24/7 Technical Support Specialist",
    tagline: "Context-Aware L1 & L2 Autonomous Issue Resolver",
    description: "Deeply ingests all company knowledge bases, historical codebase repositories, documentation files, and customer resolution history to autonomously troubleshoot high-complexity enterprise system inquiries.",
    specs: {
      framework: "LlamaIndex Semantic Vector Sharding",
      llm: "GPT-4o Omnimodal Context Layering",
      memory: "Qdrant Hybrid Keyword-Dense Search Space",
      speed: "Instantaneous Edge Node Responses"
    },
    capabilities: [
      "Multi-turn technical debugging dialogues with interactive sandboxing",
      "Dynamic system log file scanning for explicit root-cause identification",
      "Seamless API issue handoff to engineering staff with clean reproduction maps",
      "Localization & translation capability handling 40+ languages concurrently"
    ],
    impact: {
      efficiency: "88% Autonomic Resolution Rate",
      metric: "Instant Sub-Second Response Latency",
      roi: "Massively Scale Volume Without Added Headcount"
    }
  }
];

export default function ServicesPage() {
  const [activeAgent, setActiveAgent] = useState(AI_EMPLOYEES[0]);

  return (
    <main className="bg-[#09090b] min-h-screen text-white">
      {/* Background Neon Aura */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute right-1/4 top-1/4 h-[600px] w-[800px] rounded-full bg-cyan-accent/5 blur-[150px]" />
        <div className="absolute left-1/4 bottom-1/4 h-[500px] w-[600px] rounded-full bg-purple-500/5 blur-[130px]" />
      </div>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        {/* Header section */}
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-4 py-1.5 text-xs font-medium text-cyan-accent mb-4">
            <Cpu className="h-3.5 w-3.5 animate-pulse" />
            ScaleSystems Deployment Marketplace
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl mb-6">
            Explore Your Next <span className="text-gradient">Digital Workforce</span>
          </h1>
          <p className="text-lg text-slate-muted leading-relaxed">
            Select an autonomous specialist engineered to dissolve corporate administrative overhead. 
            All agents are securely integrated with your private corporate architecture, functioning at near-zero variable cost.
          </p>
        </div>

        {/* Dynamic Selector Interface */}
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Menu Column: Agent Tabs */}
          <div className="lg:col-span-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-dim px-2">Select Active Agent Profile</p>
            {AI_EMPLOYEES.map((agent) => {
              const isSelected = activeAgent.id === agent.id;
              return (
                <button
                  key={agent.id}
                  onClick={() => setActiveAgent(agent)}
                  className={`w-full text-left p-5 rounded-xl border transition-all duration-300 flex items-center justify-between group ${
                    isSelected 
                      ? "bg-white/5 border-cyan-accent/40 shadow-glow-sm" 
                      : "bg-black/20 border-white/5 hover:border-white/10 hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="space-y-1">
                    <h3 className={`font-semibold text-base transition-colors ${isSelected ? "text-cyan-accent" : "text-white group-hover:text-cyan-accent"}`}>
                      {agent.role}
                    </h3>
                    <p className="text-xs text-slate-dim line-clamp-1">{agent.tagline}</p>
                  </div>
                  <ArrowRight className={`h-4 w-4 transition-transform duration-300 ${isSelected ? "text-cyan-accent translate-x-1" : "text-slate-dim group-hover:text-white"}`} />
                </button>
              );
            })}
          </div>

          {/* Right Column: Advanced Component Specs Panel */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeAgent.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4 }}
                className="glass rounded-2xl border border-white/10 p-6 sm:p-8 space-y-8 relative overflow-hidden"
              >
                {/* Tech specifications top row decoration */}
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Terminal className="h-40 w-40 text-cyan-accent" />
                </div>

                {/* Agent Header Info */}
                <div className="space-y-2 max-w-xl">
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{activeAgent.role}</h2>
                  <p className="text-sm font-medium text-cyan-accent tracking-wide">{activeAgent.tagline}</p>
                  <p className="text-slate-muted text-sm sm:text-base leading-relaxed pt-2">{activeAgent.description}</p>
                </div>

                {/* Grid Section: Deep Technological Specs Stack */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-dim flex items-center gap-2">
                    <Network className="h-3.5 w-3.5 text-cyan-accent" /> Architecture & Technology Stack
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="bg-black/30 border border-white/5 p-3.5 rounded-lg flex gap-3 items-center">
                      <Workflow className="h-4 w-4 text-purple-400 shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-dim">Agent Framework</p>
                        <p className="text-xs font-medium text-white">{activeAgent.specs.framework}</p>
                      </div>
                    </div>
                    <div className="bg-black/30 border border-white/5 p-3.5 rounded-lg flex gap-3 items-center">
                      <Bot className="h-4 w-4 text-cyan-400 shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-dim">Inference Engine</p>
                        <p className="text-xs font-medium text-white">{activeAgent.specs.llm}</p>
                      </div>
                    </div>
                    <div className="bg-black/30 border border-white/5 p-3.5 rounded-lg flex gap-3 items-center">
                      <Database className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-dim">Memory Configuration</p>
                        <p className="text-xs font-medium text-white">{activeAgent.specs.memory}</p>
                      </div>
                    </div>
                    <div className="bg-black/30 border border-white/5 p-3.5 rounded-lg flex gap-3 items-center">
                      <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-dim">Inference Latency</p>
                        <p className="text-xs font-medium text-white">{activeAgent.specs.speed}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Core Capabilities Bullet Matrix */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-dim flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-cyan-accent" /> Operational Capabilities
                  </h4>
                  <ul className="grid sm:grid-cols-2 gap-2.5">
                    {activeAgent.capabilities.map((capability, index) => (
                      <li key={index} className="flex gap-2.5 items-start text-xs sm:text-sm text-slate-muted bg-white/[0.01] border border-white/[0.02] p-3 rounded-lg">
                        <CheckCircle className="h-4 w-4 text-cyan-accent shrink-0 mt-0.5" />
                        <span>{capability}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Business Impact Data Bar */}
                <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center">
                  <div className="flex gap-6 items-center">
                    <div>
                      <div className="text-xs text-slate-dim font-medium uppercase tracking-wider flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-emerald-400" /> Operational Efficiency
                      </div>
                      <div className="text-lg font-bold text-white">{activeAgent.impact.efficiency}</div>
                    </div>
                    <div className="h-8 w-px bg-white/10 hidden sm:block" />
                    <div>
                      <div className="text-xs text-slate-dim font-medium uppercase tracking-wider">Estimated Time ROI</div>
                      <div className="text-sm font-semibold text-slate-muted">{activeAgent.impact.metric}</div>
                    </div>
                  </div>

                  {/* Context Aware Action CTA Button */}
                  <Link href={`/contact?agent=${activeAgent.id}`} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-accent px-5 py-3 text-xs sm:text-sm font-bold text-obsidian shadow-glow-sm hover:shadow-glow transition-all whitespace-nowrap">
                    Deploy {activeAgent.role.split(" ")[0]} 
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>

              </motion.div>
            </AnimatePresence>
          </div>

        </div>
      </section>
    </main>
  );
}
