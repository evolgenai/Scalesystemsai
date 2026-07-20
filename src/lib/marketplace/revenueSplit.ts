/**
 * Marketplace monetization splits for external AgentPlugin runs.
 */

export const REVENUE_SPLIT = {
  /** Platform share of plugin-run fees */
  platform: 0.3,
  /** Developer share credited to wallet */
  developer: 0.7,
} as const;

export type RevenueSplitInput = {
  /** Gross plugin fee (USD) before split */
  grossUsd: number;
  runs: number;
  pricePerRun: number;
};

export type RevenueSplitResult = {
  grossUsd: number;
  platformShareUsd: number;
  developerShareUsd: number;
  runs: number;
  pricePerRun: number;
};

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function computePluginRevenueSplit(
  input: RevenueSplitInput
): RevenueSplitResult {
  const runs = Number.isFinite(input.runs) && input.runs > 0 ? input.runs : 0;
  const price =
    Number.isFinite(input.pricePerRun) && input.pricePerRun >= 0
      ? input.pricePerRun
      : 0;
  const fromPrice = round6(runs * price);
  const gross =
    Number.isFinite(input.grossUsd) && input.grossUsd > 0
      ? round6(input.grossUsd)
      : fromPrice;

  const developerShareUsd = round6(gross * REVENUE_SPLIT.developer);
  const platformShareUsd = round6(gross - developerShareUsd);

  return {
    grossUsd: gross,
    platformShareUsd,
    developerShareUsd,
    runs,
    pricePerRun: price,
  };
}
