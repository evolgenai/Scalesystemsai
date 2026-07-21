"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Download, Check, Share2 } from "lucide-react";

const W = 1200;
const H = 630;

type SocialShareCardGeneratorProps = {
  defaultHeadline?: string;
  defaultSubline?: string;
  className?: string;
};

export default function SocialShareCardGenerator({
  defaultHeadline = "Scale Systems v2.0 is Live",
  defaultSubline = "Claim 10,000 Free Gas Credits · Autonomous Agent OS",
  className = "",
}: SocialShareCardGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [headline, setHeadline] = useState(defaultHeadline);
  const [subline, setSubline] = useState(defaultSubline);
  const [copied, setCopied] = useState(false);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#05110d");
    g.addColorStop(0.45, "#0a1f18");
    g.addColorStop(1, "#05110d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const radial = ctx.createRadialGradient(W * 0.55, H * 0.4, 40, W * 0.55, H * 0.4, 520);
    radial.addColorStop(0, "rgba(16, 185, 129,0.35)");
    radial.addColorStop(1, "rgba(16, 185, 129,0)");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(16, 185, 129,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(32, 32, W - 64, H - 64);

    ctx.fillStyle = "#10B981";
    ctx.font = "600 28px Space Grotesk, system-ui, sans-serif";
    ctx.fillText("SCALESYSTEMS", 72, 110);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 64px Space Grotesk, system-ui, sans-serif";
    wrapText(ctx, headline, 72, 220, W - 160, 72);

    ctx.fillStyle = "#94A3B8";
    ctx.font = "400 28px Inter, system-ui, sans-serif";
    wrapText(ctx, subline, 72, 400, W - 160, 40);

    ctx.fillStyle = "#059669";
    ctx.beginPath();
    ctx.roundRect(72, H - 120, 220, 48, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 22px Inter, system-ui, sans-serif";
    ctx.fillText("Launch →", 118, H - 88);
  }, [headline, subline]);

  useEffect(() => {
    paint();
  }, [paint]);

  const download = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = "scalesystems-share-card.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  }, []);

  const copyDataUrl = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) return;
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* fallback: ignore */
    }
  }, []);

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 ${className}`}
      aria-labelledby="share-card-heading"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#10B981]">
            Social sharing
          </p>
          <h2
            id="share-card-heading"
            className="mt-1 font-display text-lg font-semibold text-white"
          >
            Share card generator
          </h2>
        </div>
        <Share2 className="h-5 w-5 text-[#10B981]" aria-hidden />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-xl border border-[#059669]/25 bg-[#05110d]">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="h-auto w-full"
            aria-label="Preview of social share card"
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="block text-xs text-slate-muted">
            Headline
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#059669]/50"
              maxLength={80}
            />
          </label>
          <label className="block text-xs text-slate-muted">
            Subline
            <input
              value={subline}
              onChange={(e) => setSubline(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#059669]/50"
              maxLength={120}
            />
          </label>
          <div className="mt-auto flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#059669] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#047857]"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download PNG
            </button>
            <button
              type="button"
              onClick={copyDataUrl}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-[#10B981]/40 hover:text-white"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              {copied ? "Copied" : "Copy image"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}
