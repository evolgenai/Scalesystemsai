/**
 * Catalog server actions — typed access to the official Scale Systems AI catalog.
 */

"use server";

import {
  buildOfficialCatalogResponse,
  getOfficialCatalogItemBySlug,
  type CatalogKind,
  type OfficialCatalogItem,
  type OfficialCatalogResponse,
} from "@/lib/catalog/officialCatalog";
import {
  withServerActionTelemetry,
  type ServerActionResult,
} from "@/lib/sentry";

export async function fetchOfficialCatalogAction(input?: {
  kind?: CatalogKind | null;
  q?: string | null;
  tenantId?: string | null;
}): Promise<ServerActionResult<OfficialCatalogResponse>> {
  return withServerActionTelemetry(
    {
      actionName: "fetchOfficialCatalog",
      source: "server_action",
      tenantId: input?.tenantId,
      route: "/api/catalog",
    },
    async () => buildOfficialCatalogResponse({ kind: input?.kind, q: input?.q })
  );
}

export async function fetchOfficialCatalogItemAction(input: {
  slug: string;
  tenantId?: string | null;
}): Promise<ServerActionResult<OfficialCatalogItem>> {
  return withServerActionTelemetry(
    {
      actionName: "fetchOfficialCatalogItem",
      source: "server_action",
      tenantId: input.tenantId,
      route: `/api/catalog?slug=${encodeURIComponent(input.slug)}`,
    },
    async () => {
      const item = getOfficialCatalogItemBySlug(input.slug);
      if (!item) {
        throw new Error(`Catalog item '${input.slug}' not found.`);
      }
      return item;
    }
  );
}
