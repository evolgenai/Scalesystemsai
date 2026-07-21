/**
 * GET /api/templates — public workflow template catalog (edge-cached).
 * Non-mutating only; no tenant secrets.
 */

import { apiError, apiSuccess } from "@/lib/http/apiResponse";
import { withEdgeCache } from "@/lib/edge/cacheControl";
import { listPublicWorkflowTemplates } from "@/lib/templates/publicCatalog";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET(request: Request) {
  try {
    const templates = listPublicWorkflowTemplates();
    return apiSuccess(
      {
        data: templates,
        meta: {
          count: templates.length,
          version: "2.0",
        },
      },
      200,
      withEdgeCache("templates", request.method)
    );
  } catch (err) {
    console.error("[api/templates] GET failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to list templates.",
      "TEMPLATES_LIST_FAILED",
      503
    );
  }
}
