"use client";

/** Shared #121212 skeleton planes for dashboard hydrate frames. */

function Bone({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-white/[0.04] ${className}`}
      aria-hidden
    />
  );
}

export function MarketplaceSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading marketplace">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Bone className="h-6 w-36 rounded-full" />
          <Bone className="h-8 w-56" />
          <Bone className="h-3 w-72 max-w-full" />
        </div>
        <Bone className="h-9 w-48" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-lg border border-white/5 bg-[#121212] p-4"
          >
            <div className="flex justify-between">
              <Bone className="h-11 w-11 rounded-lg" />
              <Bone className="h-5 w-12" />
            </div>
            <Bone className="h-4 w-[75%]" />
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-[85%]" />
            <Bone className="mt-2 h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-white/5 bg-[#121212] p-4">
        <Bone className="mb-4 h-10 w-48" />
        <div className="grid gap-3 lg:grid-cols-2">
          <Bone className="h-36 w-full" />
          <Bone className="h-36 w-full" />
        </div>
      </div>
    </div>
  );
}

export function TokenVaultSkeleton() {
  return (
    <div
      className="mt-4 overflow-hidden rounded-lg border border-white/5 bg-[#121212]"
      aria-busy
      aria-label="Loading token vault"
    >
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Bone className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Bone className="h-3.5 w-36" />
            <Bone className="h-2.5 w-24" />
          </div>
        </div>
        <Bone className="h-6 w-28 rounded" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2 border-b border-white/5 px-4 py-3.5">
          <div className="flex justify-between">
            <Bone className="h-3 w-24" />
            <Bone className="h-5 w-16 rounded-full" />
          </div>
          <Bone className="h-10 w-full rounded-lg" />
        </div>
      ))}
      <div className="flex justify-end px-4 py-3">
        <Bone className="h-9 w-28 rounded-lg" />
      </div>
    </div>
  );
}

export function ChaosConsoleSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border border-white/5 bg-[#121212]"
      aria-busy
      aria-label="Loading chaos console"
    >
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Bone className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Bone className="h-3.5 w-44" />
            <Bone className="h-2.5 w-32" />
          </div>
        </div>
        <Bone className="h-6 w-20 rounded" />
      </div>
      <div className="grid gap-0 lg:grid-cols-2">
        <div className="space-y-2 border-b border-white/5 p-4 lg:border-b-0 lg:border-r">
          <Bone className="mb-2 h-3 w-28" />
          <Bone className="h-16 w-full rounded-lg" />
          <Bone className="h-16 w-full rounded-lg" />
        </div>
        <div className="p-4">
          <Bone className="mb-2 h-3 w-36" />
          <Bone className="h-44 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function PluginAnalyticsSkeleton() {
  return (
    <div className="space-y-5" aria-busy aria-label="Loading plugin analytics">
      <div className="space-y-2">
        <Bone className="h-5 w-40 rounded-full" />
        <Bone className="h-8 w-64" />
        <Bone className="h-3 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-white/5 bg-[#121212] px-3.5 py-3"
          >
            <Bone className="h-8 w-8 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Bone className="h-2.5 w-16" />
              <Bone className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-white/5 bg-[#121212] p-4">
        <Bone className="mb-4 h-3 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Bone key={i} className="mb-3 h-10 w-full last:mb-0" />
        ))}
      </div>
    </div>
  );
}

export function EconomySkeleton() {
  return (
    <div className="mb-8 space-y-3" aria-busy aria-label="Loading economy">
      <Bone className="h-4 w-40" />
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-lg border border-white/5 bg-[#121212] p-4"
          >
            <div className="flex justify-between">
              <Bone className="h-8 w-24" />
              <Bone className="h-9 w-9 rounded-lg" />
            </div>
            <Bone className="h-16 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
