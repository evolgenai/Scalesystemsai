"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type MouseEvent,
} from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

type Hover3DIconProps = {
  children: ReactNode;
  className?: string;
  /** Depth of the tilt / float response (degrees / px). */
  intensity?: number;
  /** Emerald glow radius on hover. */
  glow?: boolean;
  /** Notify parent so labels can spring push-down. */
  onHoverChange?: (hovered: boolean) => void;
  /** Optional label for accessibility when wrapping interactive chrome. */
  "aria-hidden"?: boolean;
};

/**
 * Lightweight perspective micro-3D wrapper for dashboard icons.
 * Uses framer-motion spatial transforms — no extra WebGL canvas,
 * so it stays clear of the R3F AgentCardStack3D scene.
 */
export default function Hover3DIcon({
  children,
  className = "",
  intensity = 14,
  glow = true,
  onHoverChange,
  "aria-hidden": ariaHidden,
}: Hover3DIconProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const hoverProgress = useMotionValue(0);

  const spring = { stiffness: 320, damping: 22, mass: 0.55 };
  const rx = useSpring(
    useTransform(my, [-0.5, 0.5], [intensity, -intensity]),
    spring
  );
  const ry = useSpring(
    useTransform(mx, [-0.5, 0.5], [-intensity, intensity]),
    spring
  );
  const tz = useSpring(useTransform(hoverProgress, [0, 1], [0, 18]), spring);
  const scale = useSpring(
    useTransform(hoverProgress, [0, 1], [1, 1.12]),
    spring
  );

  const onMove = (e: MouseEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    mx.set(px);
    my.set(py);
  };

  const onEnter = () => {
    setHovered(true);
    hoverProgress.set(1);
    onHoverChange?.(true);
  };

  const onLeave = () => {
    setHovered(false);
    hoverProgress.set(0);
    mx.set(0);
    my.set(0);
    onHoverChange?.(false);
  };

  const glowStyle: CSSProperties = glow
    ? {
        filter: hovered
          ? "drop-shadow(0 0 10px rgba(52,211,153,0.65)) drop-shadow(0 0 22px rgba(16,185,129,0.35))"
          : "drop-shadow(0 0 0 transparent)",
        transition: "filter 220ms ease",
      }
    : undefined;

  return (
    <span
      ref={ref}
      aria-hidden={ariaHidden}
      className={`inline-flex shrink-0 touch-manipulation ${className}`}
      style={{ perspective: 600 }}
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      <motion.span
        className="inline-flex will-change-transform"
        style={{
          rotateX: rx,
          rotateY: ry,
          z: tz,
          scale,
          transformStyle: "preserve-3d",
          ...glowStyle,
        }}
      >
        {children}
      </motion.span>
    </span>
  );
}
