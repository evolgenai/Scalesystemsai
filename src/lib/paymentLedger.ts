export type SettlementRail = "ACH" | "SWIFT" | "VIRTUAL_LEDGER";

export interface B2BTransactionEntry {
  txId: string;
  tenantId: string;
  amount: number;
  currency: string;
  rail: SettlementRail;
  timestamp: Date;
}

export interface RoutingCompliance {
  rail: SettlementRail;
  compliant: boolean;
  flags: string[];
}

export interface LedgerAuditResult {
  valid: boolean;
  errors: string[];
  routingCompliance: RoutingCompliance;
}

const SETTLEMENT_RAILS: readonly SettlementRail[] = [
  "ACH",
  "SWIFT",
  "VIRTUAL_LEDGER",
];

const ISO_4217_CURRENCY_PATTERN = /^[A-Z]{3}$/;

const ACH_SUPPORTED_CURRENCIES = new Set(["USD"]);

export function isValidSettlementRail(rail: string): rail is SettlementRail {
  return (SETTLEMENT_RAILS as readonly string[]).includes(rail);
}

export function isPositiveAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}

export function isValidCurrencyFormat(currency: string): boolean {
  return ISO_4217_CURRENCY_PATTERN.test(currency);
}

export function isNonEmptyIdentifier(value: string): boolean {
  return value.trim().length > 0;
}

export function isValidTimestamp(timestamp: Date): boolean {
  return timestamp instanceof Date && !Number.isNaN(timestamp.getTime());
}

export function resolveRoutingComplianceFlags(
  entry: B2BTransactionEntry,
): RoutingCompliance {
  const flags: string[] = [];

  if (!isValidCurrencyFormat(entry.currency)) {
    flags.push("INVALID_CURRENCY_FORMAT");
  }

  switch (entry.rail) {
    case "ACH":
      if (!ACH_SUPPORTED_CURRENCIES.has(entry.currency)) {
        flags.push("ACH_CURRENCY_UNSUPPORTED");
      }
      if (entry.amount > 1_000_000) {
        flags.push("ACH_AMOUNT_EXCEEDS_THRESHOLD");
      }
      break;
    case "SWIFT":
      if (entry.currency.length !== 3) {
        flags.push("SWIFT_CURRENCY_NON_ISO");
      }
      break;
    case "VIRTUAL_LEDGER":
      if (!isNonEmptyIdentifier(entry.tenantId)) {
        flags.push("VIRTUAL_LEDGER_TENANT_REQUIRED");
      }
      break;
  }

  return {
    rail: entry.rail,
    compliant: flags.length === 0,
    flags,
  };
}

export function auditLedgerEntry(entry: B2BTransactionEntry): LedgerAuditResult {
  const errors: string[] = [];

  if (!isNonEmptyIdentifier(entry.txId)) {
    errors.push("txId must be a non-empty string");
  }

  if (!isNonEmptyIdentifier(entry.tenantId)) {
    errors.push("tenantId must be a non-empty string");
  }

  if (!isPositiveAmount(entry.amount)) {
    errors.push("amount must be a finite number strictly greater than zero");
  }

  if (!isValidCurrencyFormat(entry.currency)) {
    errors.push("currency must be a three-letter uppercase ISO 4217 code");
  }

  if (!isValidSettlementRail(entry.rail)) {
    errors.push("rail must be one of ACH, SWIFT, or VIRTUAL_LEDGER");
  }

  if (!isValidTimestamp(entry.timestamp)) {
    errors.push("timestamp must be a valid Date instance");
  }

  const routingCompliance = resolveRoutingComplianceFlags(entry);

  return {
    valid: errors.length === 0 && routingCompliance.compliant,
    errors,
    routingCompliance,
  };
}
