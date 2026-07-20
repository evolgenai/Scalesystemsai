/**
 * Standardized global HTTP response envelopes.
 * All backend API routes should prefer these helpers for uniform JSON shapes.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

export const ApiEnvelopeSuccessSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  timestamp: z.string().datetime(),
});

export const ApiEnvelopeErrorSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
  code: z.string().min(1),
  timestamp: z.string().datetime(),
  data: z.null().optional(),
});

export type ApiEnvelopeSuccess<T> = {
  success: true;
  data: T;
  timestamp: string;
};

export type ApiEnvelopeError = {
  success: false;
  error: string;
  code: string;
  timestamp: string;
  data?: null;
};

export type ApiEnvelope<T> = ApiEnvelopeSuccess<T> | ApiEnvelopeError;

function nowIso(): string {
  return new Date().toISOString();
}

export function envelopeSuccess<T>(data: T): ApiEnvelopeSuccess<T> {
  return {
    success: true,
    data,
    timestamp: nowIso(),
  };
}

export function envelopeError(
  error: string,
  code: string
): ApiEnvelopeError {
  return {
    success: false,
    error,
    code,
    timestamp: nowIso(),
    data: null,
  };
}

export type EnvelopeInit = {
  status?: number;
  headers?: HeadersInit;
};

export function apiOk<T>(
  data: T,
  init?: EnvelopeInit
): NextResponse<ApiEnvelopeSuccess<T>> {
  return NextResponse.json(envelopeSuccess(data), {
    status: init?.status ?? 200,
    headers: {
      "cache-control": "no-store",
      ...init?.headers,
    },
  });
}

export function apiFail(
  error: string,
  code: string,
  status: number,
  headers?: HeadersInit
): NextResponse<ApiEnvelopeError> {
  return NextResponse.json(envelopeError(error, code), {
    status,
    headers: {
      "cache-control": "no-store",
      ...headers,
    },
  });
}

/** Type guard for clients / processors parsing unknown JSON. */
export function isApiEnvelopeSuccess<T = unknown>(
  value: unknown
): value is ApiEnvelopeSuccess<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ApiEnvelopeSuccess<T>).success === true &&
    "data" in value &&
    typeof (value as ApiEnvelopeSuccess<T>).timestamp === "string"
  );
}
