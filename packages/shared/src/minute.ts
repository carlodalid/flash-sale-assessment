const MINUTE_MS = 60_000;

/**
 * Sale times are whole minutes so they match what the page shows ("Starts at
 * 09:02"). Rounding down means the displayed time is exactly when it happens.
 * Works on the epoch, so it is independent of timezone.
 */
export function floorToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS);
}
