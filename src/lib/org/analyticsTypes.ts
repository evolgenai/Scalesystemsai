/**
 * Client-safe shapes for GET /api/orgs/analytics.
 * Backend may alias fields; the UI normalizer accepts common variants.
 */

export type AnalyticsRunStatus = "Success" | "Failed" | "Terminated";

export type AnalyticsRunLog = {
  id: string;
  objective: string;
  persona: string;
  status: AnalyticsRunStatus;
  durationSeconds: number;
  creditsSpent: number;
};

export type OrgAnalyticsPayload = {
  totalSwarmsRun: number;
  creditsConsumed: number;
  creditsQuota: number;
  tokensConsumed?: number;
  averageRunTimeSeconds: number;
  hitlRatePercent: number;
  runs: AnalyticsRunLog[];
};

export type SortKey =
  | "objective"
  | "persona"
  | "status"
  | "durationSeconds"
  | "creditsSpent";
