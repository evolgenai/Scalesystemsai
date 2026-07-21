/**
 * Prepaid Gas top-up catalog — shared by PayPal, Stripe/Google Pay, Lightning.
 */

export type GasPackageId = "starter" | "scale" | "overlord";

export type GasPackage = {
  id: GasPackageId;
  label: string;
  /** Fiat price in USD major units. */
  priceUsd: number;
  /** Integer Gas units credited on successful settlement. */
  gas: number;
  badge?: string;
};

export const GAS_PACKAGES: readonly GasPackage[] = [
  {
    id: "starter",
    label: "Starter Burst",
    priceUsd: 10,
    gas: 100_000,
  },
  {
    id: "scale",
    label: "Scale Pack",
    priceUsd: 50,
    gas: 600_000,
    badge: "Best value",
  },
  {
    id: "overlord",
    label: "Overlord Reserve",
    priceUsd: 200,
    gas: 3_000_000,
  },
] as const;

const BY_ID = new Map(GAS_PACKAGES.map((p) => [p.id, p]));

export function isGasPackageId(value: string): value is GasPackageId {
  return BY_ID.has(value as GasPackageId);
}

export function getGasPackage(id: string): GasPackage | null {
  return BY_ID.get(id as GasPackageId) ?? null;
}

/** USD major → integer cents. */
export function packageAmountCents(pack: GasPackage): number {
  return Math.round(pack.priceUsd * 100);
}

/**
 * Approximate sats for Lightning invoices (env override or ~$100k/BTC default).
 * Uses integer sats; never fractional.
 */
export function packageAmountSats(pack: GasPackage): number {
  const btcUsd =
    Number(process.env.LIGHTNING_BTC_USD_RATE?.trim()) || 100_000;
  const sats = Math.round((pack.priceUsd / btcUsd) * 100_000_000);
  return Math.max(1, sats);
}
