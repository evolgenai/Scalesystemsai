"use client";

import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export default function GlowingEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const active = Boolean(
    selected || (data as { active?: boolean } | undefined)?.active
  );

  return (
    <g className={active ? "blueprint-edge-active" : undefined}>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: active ? "#10B981" : "rgba(16, 185, 129,0.45)",
          strokeWidth: active ? 2.5 : 1.75,
          filter: active
            ? "drop-shadow(0 0 6px rgba(16, 185, 129,0.85))"
            : "drop-shadow(0 0 3px rgba(16, 185, 129,0.35))",
        }}
      />
      {active ? (
        <>
          <circle r="3.5" fill="#34D399" className="blueprint-particle">
            <animateMotion dur="1.4s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="2" fill="#6EE7B7" className="blueprint-particle-trail">
            <animateMotion
              dur="1.4s"
              begin="0.35s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
        </>
      ) : null}
    </g>
  );
}
