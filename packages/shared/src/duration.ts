const UNIT_TO_MS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/;

/** Parses human-friendly durations such as "30s", "5m" or "2h" into milliseconds. */
export function parseDuration(input: string): number {
  const match = DURATION_PATTERN.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration "${input}". Use a number followed by ms, s, m, h or d (e.g. "30s").`);
  }

  const [, amount, unit] = match as unknown as [string, string, keyof typeof UNIT_TO_MS];
  return Number(amount) * UNIT_TO_MS[unit];
}
