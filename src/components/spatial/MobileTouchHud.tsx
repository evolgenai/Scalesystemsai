"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addTouchLook,
  clearTouchMove,
  setTouchMove,
} from "@/lib/spatial/touchInput";

type Dir = "up" | "down" | "left" | "right";

const DIR_VEC: Record<Dir, { f: number; s: number }> = {
  up: { f: 1, s: 0 },
  down: { f: -1, s: 0 },
  left: { f: 0, s: -1 },
  right: { f: 0, s: 1 },
};

/**
 * Virtual d-pad + swipe-look surface for mobile Spatial Universe.
 * Visible only below the md breakpoint (< 768px).
 */
export default function MobileTouchHud({
  enabled,
  locked,
}: {
  enabled: boolean;
  locked: boolean;
}) {
  const held = useRef<Set<Dir>>(new Set());
  const swipeOrigin = useRef<{ x: number; y: number } | null>(null);
  const [compact, setCompact] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const syncMove = useCallback(() => {
    let f = 0;
    let s = 0;
    for (const d of held.current) {
      f += DIR_VEC[d].f;
      s += DIR_VEC[d].s;
    }
    const len = Math.hypot(f, s) || 1;
    setTouchMove(f / len, s / len);
  }, []);

  const press = useCallback(
    (dir: Dir) => {
      held.current.add(dir);
      syncMove();
    },
    [syncMove]
  );

  const release = useCallback(
    (dir: Dir) => {
      held.current.delete(dir);
      if (held.current.size === 0) clearTouchMove();
      else syncMove();
    },
    [syncMove]
  );

  useEffect(() => {
    if (!enabled || !locked) {
      held.current.clear();
      clearTouchMove();
    }
  }, [enabled, locked]);

  useEffect(() => {
    return () => clearTouchMove();
  }, []);

  if (!enabled || !compact || !locked) return null;

  const btn =
    "flex h-11 w-11 items-center justify-center rounded-xl border border-[#00ffaa]/35 bg-[#0b120f]/85 font-mono text-sm text-[#00ffaa] shadow-[0_0_16px_rgba(0,255,170,0.12)] active:bg-[#00ffaa]/25 select-none touch-none";

  return (
    <>
      {/* Right-side swipe look pad */}
      <div
        className="pointer-events-auto absolute inset-y-[18%] right-0 z-25 w-[38%] touch-none md:hidden"
        aria-hidden
        onTouchStart={(e) => {
          const t = e.changedTouches[0];
          if (!t) return;
          swipeOrigin.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchMove={(e) => {
          const t = e.changedTouches[0];
          const origin = swipeOrigin.current;
          if (!t || !origin) return;
          const dx = t.clientX - origin.x;
          const dy = t.clientY - origin.y;
          swipeOrigin.current = { x: t.clientX, y: t.clientY };
          addTouchLook(-dx * 0.0045, dy * 0.0032);
        }}
        onTouchEnd={() => {
          swipeOrigin.current = null;
        }}
        onTouchCancel={() => {
          swipeOrigin.current = null;
        }}
      />

      {/* Virtual d-pad */}
      <div className="pointer-events-auto absolute bottom-24 left-3 z-30 grid grid-cols-3 gap-1 md:hidden">
        <span />
        <button
          type="button"
          className={btn}
          aria-label="Move forward"
          onTouchStart={(e) => {
            e.preventDefault();
            press("up");
          }}
          onTouchEnd={() => release("up")}
          onTouchCancel={() => release("up")}
        >
          ▲
        </button>
        <span />
        <button
          type="button"
          className={btn}
          aria-label="Strafe left"
          onTouchStart={(e) => {
            e.preventDefault();
            press("left");
          }}
          onTouchEnd={() => release("left")}
          onTouchCancel={() => release("left")}
        >
          ◀
        </button>
        <button
          type="button"
          className={btn}
          aria-label="Move back"
          onTouchStart={(e) => {
            e.preventDefault();
            press("down");
          }}
          onTouchEnd={() => release("down")}
          onTouchCancel={() => release("down")}
        >
          ▼
        </button>
        <button
          type="button"
          className={btn}
          aria-label="Strafe right"
          onTouchStart={(e) => {
            e.preventDefault();
            press("right");
          }}
          onTouchEnd={() => release("right")}
          onTouchCancel={() => release("right")}
        >
          ▶
        </button>
      </div>
    </>
  );
}
