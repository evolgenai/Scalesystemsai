"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Loader2, Trash2 } from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";

export type MemoryBankRow = {
  id: string;
  fragment: string;
  domain: string;
  dateSaved: string;
};

function formatDate(raw: string): string {
  try {
    return new Date(raw).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return raw || "—";
  }
}

function normalizeRows(payload: unknown): MemoryBankRow[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { memories?: unknown; items?: unknown };
  const list = Array.isArray(root.memories)
    ? root.memories
    : Array.isArray(root.items)
      ? root.items
      : [];

  const rows: MemoryBankRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? row.memoryId ?? "").trim();
    if (!id) continue;
    const fragment = String(
      row.fragment ?? row.text ?? row.content ?? row.memory ?? ""
    ).trim();
    if (!fragment) continue;
    rows.push({
      id,
      fragment,
      domain: String(
        row.relevanceDomain ?? row.domain ?? row.category ?? "general"
      ),
      dateSaved: String(
        row.dateSaved ?? row.createdAt ?? row.savedAt ?? ""
      ),
    });
  }
  return rows;
}

export default function MemoryBankCard() {
  const [rows, setRows] = useState<MemoryBankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/orgs/memories", {
        headers: {
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload &&
          "error" in payload &&
          typeof (payload as { error?: string }).error === "string"
            ? (payload as { error: string }).error
            : `Unable to load memories (HTTP ${response.status}).`;
        setError(message);
        setRows([]);
        return;
      }
      setRows(normalizeRows(payload));
    } catch {
      setError("Network error loading memory bank.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMemories();
    const onOrgChanged = () => {
      void loadMemories();
    };
    window.addEventListener("scalesystems:org-changed", onOrgChanged);
    return () =>
      window.removeEventListener("scalesystems:org-changed", onOrgChanged);
  }, [loadMemories]);

  const deleteMemory = async (memoryId: string) => {
    setDeletingId(memoryId);
    setError(null);
    try {
      const response = await fetch("/api/orgs/memories", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({ memoryId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || payload.success === false) {
        setError(payload.error ?? `Delete failed (HTTP ${response.status}).`);
        return;
      }
      setRows((prev) => prev.filter((row) => row.id !== memoryId));
    } catch {
      setError("Network error deleting memory.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-accent/30 bg-cyan-accent/10">
          <Brain className="h-4 w-4 text-cyan-accent" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm font-semibold text-white">
            Memory Bank
          </h2>
          <p className="mt-1 text-xs text-slate-dim">
            Long-term semantic fragments recalled across swarm sessions for this
            workspace.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-black/40 text-[10px] uppercase tracking-wider text-slate-dim">
            <tr>
              <th className="px-3 py-2.5 font-medium">Memory Fragment</th>
              <th className="px-3 py-2.5 font-medium">Relevance Domain</th>
              <th className="px-3 py-2.5 font-medium">Date Saved</th>
              <th className="px-3 py-2.5 font-medium">
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-slate-dim"
                >
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Loading memories…
                  </span>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-slate-dim"
                >
                  No stored memories yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="max-w-[16rem] px-3 py-2.5 text-slate-100">
                    <span className="line-clamp-2">{row.fragment}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-cyan-accent/90">
                    {row.domain}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-muted">
                    {formatDate(row.dateSaved)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => void deleteMemory(row.id)}
                      disabled={deletingId === row.id}
                      className="inline-flex rounded-lg border border-rose-500/25 bg-rose-500/10 p-1.5 text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-40"
                      aria-label={`Delete memory ${row.id}`}
                    >
                      {deletingId === row.id ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
