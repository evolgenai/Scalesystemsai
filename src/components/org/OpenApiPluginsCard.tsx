"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  FileJson,
  Loader2,
  Plug,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { getActiveOrgId } from "@/lib/org/activeOrg";
import {
  isAllowedSpecFile,
  parseOpenApiSpec,
  readFileAsText,
} from "@/lib/plugins/parseOpenApiSpec";
import {
  DEFAULT_PLUGIN_DRAFT,
  draftToAuthConfig,
  type PluginAuthType,
  type PluginApiKeyLocation,
  type WorkspacePlugin,
  type WorkspacePluginDraft,
} from "@/lib/plugins/types";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import {
  createPluginId,
  deleteWorkspacePlugin,
  listWorkspacePlugins,
  PLUGINS_CHANGED_EVENT,
  saveWorkspacePlugin,
  setWorkspacePluginActive,
} from "@/lib/plugins/workspacePluginsStore";

type ToastTone = "success" | "error" | "info";

type ToastState = {
  tone: ToastTone;
  message: string;
} | null;

const TOAST_STYLES: Record<ToastTone, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  error: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  info: "border-amber-500/30 bg-amber-500/10 text-amber-200",
};

const AUTH_OPTIONS: { value: PluginAuthType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "bearer", label: "Bearer Token (Header)" },
  { value: "apiKey", label: "API Key (Query / Header)" },
];

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-xs text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-accent/40 focus:ring-1 focus:ring-cyan-accent/20";

const labelClassName =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-dim";

export default function OpenApiPluginsCard() {
  const [plugins, setPlugins] = useState<WorkspacePlugin[]>([]);
  const [draft, setDraft] = useState<WorkspacePluginDraft>(DEFAULT_PLUGIN_DRAFT);
  const [dragActive, setDragActive] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = useCallback((tone: ToastTone, message: string) => {
    setToast({ tone, message });
  }, []);

  const reload = useCallback(() => {
    setPlugins(listWorkspacePlugins(getActiveOrgId()));
  }, []);

  useEffect(() => {
    reload();

    const onChanged = () => reload();
    const onOrgChanged = () => reload();

    if (typeof window === "undefined") return;

    window.addEventListener(PLUGINS_CHANGED_EVENT, onChanged);
    window.addEventListener("scalesystems:org-changed", onOrgChanged);
    return () => {
      window.removeEventListener(PLUGINS_CHANGED_EVENT, onChanged);
      window.removeEventListener("scalesystems:org-changed", onOrgChanged);
    };
  }, [reload]);

  useEffect(() => {
    if (!toast || typeof window === "undefined") return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const ingestFile = async (file: File) => {
    if (!isAllowedSpecFile(file)) {
      showToast("error", "Only .json and .yaml / .yml OpenAPI specs are supported.");
      return;
    }

    setParsing(true);
    try {
      const text = await readFileAsText(file);
      const meta = parseOpenApiSpec(text, file.name);
      setDraft((prev) => ({
        ...prev,
        name: prev.name.trim() || meta.title || file.name.replace(/\.(json|ya?ml)$/i, ""),
        fileName: file.name,
        specFormat: meta.format,
        specText: meta.specText,
        defaultBaseUrl: meta.defaultBaseUrl,
        baseUrlOverride: prev.baseUrlOverride,
      }));
      showToast(
        "success",
        `Loaded ${meta.format.toUpperCase()} spec${meta.title ? ` — ${meta.title}` : ""}.`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to parse OpenAPI spec.";
      showToast("error", message);
    } finally {
      setParsing(false);
    }
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await ingestFile(file);
  };

  const onFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await ingestFile(file);
  };

  const updateDraft = <K extends keyof WorkspacePluginDraft>(
    key: K,
    value: WorkspacePluginDraft[K]
  ) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "authType") {
        const authType = value as PluginAuthType;
        if (authType === "bearer") {
          next.authHeaderName = prev.authHeaderName || "Authorization";
        }
        if (authType === "apiKey") {
          next.authKeyName = prev.authKeyName || "x-api-key";
        }
      }
      return next;
    });
  };

  const registerPlugin = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      showToast("info", "Enter a plugin name before registering.");
      return;
    }
    if (!draft.specText || !draft.specFormat) {
      showToast("info", "Upload an OpenAPI .json or .yaml file first.");
      return;
    }

    const override = draft.baseUrlOverride.trim();
    const baseUrl = override || draft.defaultBaseUrl || "";
    if (!baseUrl) {
      showToast(
        "info",
        "Provide a Base URL override — this spec has no default servers[0].url."
      );
      return;
    }

    if (draft.authType !== "none" && !draft.authSecret.trim()) {
      showToast("info", "Enter an auth token / key value, or set Auth Type to None.");
      return;
    }

    setSaving(true);
    try {
      const auth = draftToAuthConfig(draft);
      const authHeader =
        auth.type === "bearer"
          ? auth.headerName
          : auth.type === "apiKey"
            ? auth.keyName
            : "Authorization";
      const authToken =
        auth.type === "bearer"
          ? auth.token
          : auth.type === "apiKey"
            ? auth.keyValue
            : null;

      let serverId: string | null = null;
      try {
        const response = await fetch("/api/plugins/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getClientAuthHeaders(),
          },
          body: JSON.stringify({
            name,
            baseUrl,
            authType: draft.authType,
            authHeader,
            authToken,
            workspaceId: getActiveOrgId(),
            fileName: draft.fileName,
            spec: draft.specText,
          }),
        });
        const payload = (await response.json()) as {
          success?: boolean;
          error?: string;
          plugin?: { id?: string };
          warnings?: Array<{ warning?: string }>;
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Server registration failed.");
        }
        serverId = payload.plugin?.id ?? null;
        const warn = payload.warnings?.[0]?.warning;
        if (warn) showToast("info", warn);
      } catch (error) {
        // Soft-fail — keep local mount so the workspace UI stays usable offline.
        console.warn(
          "[plugins] secure register unavailable, falling back to local store:",
          error instanceof Error ? error.message : error
        );
        showToast(
          "info",
          "Secure backend register unavailable — saved locally for this browser only."
        );
      }

      const now = new Date().toISOString();
      const plugin: WorkspacePlugin = {
        id: serverId ?? createPluginId(),
        name,
        baseUrl,
        defaultBaseUrl: draft.defaultBaseUrl,
        auth: {
          ...auth,
          // Never retain plaintext secrets in localStorage after a secure register.
          ...(auth.type === "bearer"
            ? { token: serverId ? "" : auth.token }
            : auth.type === "apiKey"
              ? { keyValue: serverId ? "" : auth.keyValue }
              : {}),
        },
        active: true,
        fileName: draft.fileName,
        specFormat: draft.specFormat,
        specText: draft.specText,
        createdAt: now,
        updatedAt: now,
      };
      const next = saveWorkspacePlugin(plugin, getActiveOrgId());
      setPlugins(next);
      setDraft(DEFAULT_PLUGIN_DRAFT);
      showToast(
        "success",
        serverId
          ? `Registered “${name}” — encrypted and ready to mount.`
          : `Registered “${name}” — active and ready to mount.`
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (pluginId: string, active: boolean) => {
    setPlugins(setWorkspacePluginActive(pluginId, active, getActiveOrgId()));
  };

  const removePlugin = (pluginId: string, name: string) => {
    setPlugins(deleteWorkspacePlugin(pluginId, getActiveOrgId()));
    showToast("success", `Removed “${name}”.`);
  };

  const authCredentialLabel =
    draft.authType === "apiKey" ? "Auth Key Value" : "Auth Token";

  return (
    <section
      id="plugins"
      className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-cyan-accent/30 bg-cyan-accent/5 p-2">
            <Plug className="h-4 w-4 text-cyan-accent" aria-hidden />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Workspace Plugins
            </h2>
            <p className="mt-1 text-sm text-slate-muted">
              Upload OpenAPI 3.0 / Swagger specs so swarms can call third-party APIs.
            </p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-3 py-1 text-[11px] font-medium text-cyan-accent">
          <FileJson className="h-3 w-3" aria-hidden />
          {plugins.length} registered
        </span>
      </div>

      {toast ? (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${TOAST_STYLES[toast.tone]}`}
        >
          {toast.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : toast.tone === "error" ? (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : null}
          <span>{toast.message}</span>
        </div>
      ) : null}

      {/* Upload zone */}
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDrop={(e) => void onDrop(e)}
        className={`relative rounded-2xl border border-dashed px-4 py-8 text-center transition-colors ${
          dragActive
            ? "border-cyan-accent/60 bg-cyan-accent/10"
            : "border-white/15 bg-black/30 hover:border-cyan-accent/30"
        }`}
      >
        <Upload
          className={`mx-auto h-7 w-7 ${dragActive ? "text-cyan-accent" : "text-slate-dim"}`}
          aria-hidden
        />
        <p className="mt-3 text-sm text-slate-200">
          Drag &amp; drop an OpenAPI file
        </p>
        <p className="mt-1 text-xs text-slate-dim">
          Accepts <span className="font-mono text-slate-muted">.json</span>,{" "}
          <span className="font-mono text-slate-muted">.yaml</span>,{" "}
          <span className="font-mono text-slate-muted">.yml</span>
        </p>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-muted transition-colors hover:border-cyan-accent/30 hover:text-cyan-accent">
          {parsing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <FileJson className="h-3.5 w-3.5" aria-hidden />
          )}
          Browse files
          <input
            type="file"
            accept=".json,.yaml,.yml,application/json,application/x-yaml,text/yaml"
            className="sr-only"
            onChange={(e) => void onFileInput(e)}
            disabled={parsing}
          />
        </label>
        {draft.fileName ? (
          <p className="mt-3 font-mono text-[11px] text-emerald-300/90">
            Loaded: {draft.fileName}
            {draft.defaultBaseUrl ? ` · default ${draft.defaultBaseUrl}` : ""}
          </p>
        ) : null}
      </div>

      {/* Manual configuration */}
      <form onSubmit={registerPlugin} className="space-y-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">
          Manual configuration
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="plugin-name" className={labelClassName}>
              Plugin Name
            </label>
            <input
              id="plugin-name"
              type="text"
              value={draft.name}
              onChange={(e) => updateDraft("name", e.target.value)}
              placeholder='e.g. "Slack Messenger"'
              className={inputClassName}
              autoComplete="off"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="plugin-base-url" className={labelClassName}>
              Base URL Override
              <span className="ml-1 font-normal normal-case tracking-normal text-slate-dim/80">
                (optional)
              </span>
            </label>
            <input
              id="plugin-base-url"
              type="url"
              value={draft.baseUrlOverride}
              onChange={(e) => updateDraft("baseUrlOverride", e.target.value)}
              placeholder={
                draft.defaultBaseUrl ?? "https://api.example.com/v1"
              }
              className={inputClassName}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div>
            <label htmlFor="plugin-auth-type" className={labelClassName}>
              Auth Type
            </label>
            <select
              id="plugin-auth-type"
              value={draft.authType}
              onChange={(e) =>
                updateDraft("authType", e.target.value as PluginAuthType)
              }
              className={inputClassName}
            >
              {AUTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {draft.authType === "bearer" ? (
            <div>
              <label htmlFor="plugin-auth-header" className={labelClassName}>
                Auth Header Name
              </label>
              <input
                id="plugin-auth-header"
                type="text"
                value={draft.authHeaderName}
                onChange={(e) => updateDraft("authHeaderName", e.target.value)}
                placeholder="Authorization"
                className={inputClassName}
                autoComplete="off"
              />
            </div>
          ) : null}

          {draft.authType === "apiKey" ? (
            <>
              <div>
                <label htmlFor="plugin-key-name" className={labelClassName}>
                  Auth Key Name
                </label>
                <input
                  id="plugin-key-name"
                  type="text"
                  value={draft.authKeyName}
                  onChange={(e) => updateDraft("authKeyName", e.target.value)}
                  placeholder="x-api-key"
                  className={inputClassName}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="plugin-key-location" className={labelClassName}>
                  Key Location
                </label>
                <select
                  id="plugin-key-location"
                  value={draft.authLocation}
                  onChange={(e) =>
                    updateDraft(
                      "authLocation",
                      e.target.value as PluginApiKeyLocation
                    )
                  }
                  className={inputClassName}
                >
                  <option value="header">Header</option>
                  <option value="query">Query</option>
                </select>
              </div>
            </>
          ) : null}

          {draft.authType !== "none" ? (
            <div className={draft.authType === "apiKey" ? "sm:col-span-2" : ""}>
              <label htmlFor="plugin-auth-secret" className={labelClassName}>
                {authCredentialLabel}
              </label>
              <input
                id="plugin-auth-secret"
                type="password"
                value={draft.authSecret}
                onChange={(e) => updateDraft("authSecret", e.target.value)}
                placeholder={
                  draft.authType === "bearer" ? "Bearer token…" : "API key…"
                }
                className={inputClassName}
                autoComplete="new-password"
                spellCheck={false}
              />
            </div>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={saving || parsing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-accent/40 bg-cyan-accent/10 px-4 py-2.5 text-xs font-semibold text-cyan-accent transition-colors hover:bg-cyan-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Plug className="h-3.5 w-3.5" aria-hidden />
          )}
          Register plugin
        </button>
      </form>

      {/* Active plugins grid */}
      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-slate-dim">
          Registered plugins
        </p>
        {plugins.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-6 text-center text-xs text-slate-dim">
            No plugins yet — upload a spec to get started.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {plugins.map((plugin) => (
              <li
                key={plugin.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/30 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {plugin.name}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-slate-dim">
                      {plugin.baseUrl}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-dim">
                      {plugin.specFormat} · {plugin.auth.type}
                      {plugin.fileName ? ` · ${plugin.fileName}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePlugin(plugin.id, plugin.name)}
                    className="rounded-lg border border-transparent p-1.5 text-slate-dim transition-colors hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300"
                    aria-label={`Remove ${plugin.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-3">
                  <span
                    className={`text-[11px] font-medium ${
                      plugin.active ? "text-emerald-300" : "text-slate-dim"
                    }`}
                  >
                    {plugin.active ? "Active" : "Inactive"}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={plugin.active}
                    onClick={() => toggleActive(plugin.id, !plugin.active)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      plugin.active
                        ? "bg-emerald-500/80"
                        : "bg-white/10"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        plugin.active ? "left-5" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
