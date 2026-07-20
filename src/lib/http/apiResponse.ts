/**
 * Production-grade API envelope helpers — strict success / error shapes.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

export const ApiErrorBodySchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
  code: z.string().min(1),
});

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export const ApiSuccessMetaSchema = z.object({
  success: z.literal(true),
});

export type ApiSuccessMeta = z.infer<typeof ApiSuccessMetaSchema>;

export function apiError(
  error: string,
  code: string,
  status: number,
  headers?: HeadersInit
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { success: false, error, code };
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function apiSuccess<T extends Record<string, unknown>>(
  payload: T,
  status = 200,
  headers?: HeadersInit
): NextResponse<T & ApiSuccessMeta> {
  return NextResponse.json(
    { success: true as const, ...payload },
    {
      status,
      headers: {
        "cache-control": "no-store",
        ...headers,
      },
    }
  );
}
