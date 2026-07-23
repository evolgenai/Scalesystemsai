/**
 * GET /api/theme/texture-matrix
 * Dark granular bio-metallic texture parameters + Image 3 color tokens.
 */

import { apiSuccess, apiError } from "@/lib/http/apiResponse";
import {
  getTextureMatrix,
  textureCacheHeaders,
} from "@/lib/theme/textureMatrix";
import {
  captureStructuredError,
  telemetryContextFromRequest,
} from "@/lib/sentry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const matrix = getTextureMatrix();
    return apiSuccess(
      {
        matrix,
        theme: matrix.theme,
        version: matrix.version,
        colors: matrix.colors,
        grain: matrix.grain,
        surfaces: matrix.surfaces,
        cssVariables: matrix.cssVariables,
        cacheKey: matrix.cacheKey,
      },
      200,
      textureCacheHeaders(matrix)
    );
  } catch (error) {
    captureStructuredError(
      error,
      telemetryContextFromRequest(request, {
        route: "/api/theme/texture-matrix",
      })
    );
    return apiError(
      error instanceof Error ? error.message : "Texture matrix failed.",
      "TEXTURE_MATRIX_FAILED",
      500,
      textureCacheHeaders()
    );
  }
}
