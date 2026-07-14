/** Auth strategies supported by workspace OpenAPI plugins. */
export type PluginAuthType = "none" | "bearer" | "apiKey";

export type PluginApiKeyLocation = "header" | "query";

export type PluginAuthConfig =
  | { type: "none" }
  | {
      type: "bearer";
      headerName: string;
      token: string;
    }
  | {
      type: "apiKey";
      location: PluginApiKeyLocation;
      keyName: string;
      keyValue: string;
    };

export type OpenApiSpecFormat = "json" | "yaml";

/**
 * Registered OpenAPI plugin available to swarms in the active workspace.
 */
export type WorkspacePlugin = {
  id: string;
  name: string;
  /** Effective base URL (override or default from the spec). */
  baseUrl: string;
  /** servers[0].url extracted from the OpenAPI document, if any. */
  defaultBaseUrl: string | null;
  auth: PluginAuthConfig;
  /** When false, the plugin is hidden from swarm tool mounts. */
  active: boolean;
  fileName: string | null;
  specFormat: OpenApiSpecFormat;
  /** Raw OpenAPI document text retained for future tool derivation. */
  specText: string;
  createdAt: string;
  updatedAt: string;
};

/** UI draft state while configuring a new or edited plugin. */
export type WorkspacePluginDraft = {
  name: string;
  baseUrlOverride: string;
  authType: PluginAuthType;
  authHeaderName: string;
  authKeyName: string;
  authLocation: PluginApiKeyLocation;
  authSecret: string;
  fileName: string | null;
  specFormat: OpenApiSpecFormat | null;
  specText: string;
  defaultBaseUrl: string | null;
};

export type ParsedOpenApiMeta = {
  title: string | null;
  defaultBaseUrl: string | null;
  format: OpenApiSpecFormat;
  specText: string;
};

export const DEFAULT_PLUGIN_DRAFT: WorkspacePluginDraft = {
  name: "",
  baseUrlOverride: "",
  authType: "none",
  authHeaderName: "Authorization",
  authKeyName: "x-api-key",
  authLocation: "header",
  authSecret: "",
  fileName: null,
  specFormat: null,
  specText: "",
  defaultBaseUrl: null,
};

export function createEmptyAuth(type: PluginAuthType): PluginAuthConfig {
  switch (type) {
    case "bearer":
      return { type: "bearer", headerName: "Authorization", token: "" };
    case "apiKey":
      return {
        type: "apiKey",
        location: "header",
        keyName: "x-api-key",
        keyValue: "",
      };
    case "none":
    default:
      return { type: "none" };
  }
}

export function draftToAuthConfig(draft: WorkspacePluginDraft): PluginAuthConfig {
  switch (draft.authType) {
    case "bearer":
      return {
        type: "bearer",
        headerName: draft.authHeaderName.trim() || "Authorization",
        token: draft.authSecret,
      };
    case "apiKey":
      return {
        type: "apiKey",
        location: draft.authLocation,
        keyName: draft.authKeyName.trim() || "x-api-key",
        keyValue: draft.authSecret,
      };
    case "none":
    default:
      return { type: "none" };
  }
}
