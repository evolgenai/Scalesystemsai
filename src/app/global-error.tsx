"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

function isWebGlRelated(error: Error): boolean {
  const blob = `${error.name} ${error.message} ${error.stack ?? ""}`.toLowerCase();
  return (
    blob.includes("webgl") ||
    blob.includes("three") ||
    blob.includes("webglcontextlost") ||
    blob.includes("getcontext") ||
    blob.includes("gpu")
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const webgl = isWebGlRelated(error);

  useEffect(() => {
    Sentry.captureException(error, {
      tags: {
        boundary: "global-error",
        nextjs: "app-router",
        webgl_related: webgl ? "1" : "0",
      },
      contexts: {
        nextjs: {
          digest: error.digest ?? null,
          runtime: "client",
        },
      },
      extra: {
        name: error.name,
        message: error.message,
        stack: error.stack?.slice(0, 4000) ?? null,
        webglRelated: webgl,
      },
      level: "fatal",
    });
  }, [error, webgl]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(ellipse at center, #152e24 0%, #13191c 45%, #080b0c 100%)",
          color: "#e2e8f0",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          boxShadow: "inset 0 0 120px rgba(8, 11, 12, 0.85)",
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: 440,
            margin: 24,
            padding: 28,
            borderRadius: 16,
            border: "1px solid rgba(0, 255, 170, 0.28)",
            background:
              "linear-gradient(165deg, rgba(26, 36, 40, 0.95), rgba(19, 25, 28, 0.92))",
            textAlign: "center",
            boxShadow:
              "inset 0 1px 0 rgba(0, 255, 170, 0.08), 0 16px 48px rgba(0, 0, 0, 0.45)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#00ffaa",
            }}
          >
            Scale Systems AI
          </p>
          <h1
            style={{
              margin: "12px 0 0",
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {webgl ? "WebGL viewport failed" : "Something went wrong"}
          </h1>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 14,
              lineHeight: 1.55,
              color: "#94a3b8",
            }}
          >
            {webgl
              ? "The 3D engine hit a GPU/context error. Retry remounts the canvas; if it keeps failing, use a non-WebGL view or update your graphics drivers."
              : "A critical render failure was captured. You can retry the connection without leaving this page."}
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "10px 0 0",
                fontFamily: "ui-monospace, monospace",
                fontSize: 10,
                color: "#64748b",
              }}
            >
              digest {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 20,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid rgba(0, 255, 170, 0.45)",
              background: "rgba(0, 255, 170, 0.12)",
              color: "#00ffaa",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Retry Connection
          </button>
        </div>
      </body>
    </html>
  );
}
