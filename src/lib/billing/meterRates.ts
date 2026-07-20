/** Shared meter rate constants (kept separate to avoid circular imports). */

export const METER_RATES = {
  /** USD per 1k input tokens */
  per1kTokens: 0.0004,
  /** USD per self-refining correction cycle */
  perCorrectionCycle: 0.0025,
  /** USD per outbound notification channel attempt */
  perNotification: 0.001,
  /** USD per generic plugin/tool invocation */
  perPluginInvoke: 0.0015,
  /** Flat heal transaction base fee */
  healBase: 0.0005,
} as const;
