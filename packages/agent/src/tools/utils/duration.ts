/**
 * Parse and clamp an unknown value to a positive integer duration in ms.
 * Handles both number and string inputs (useful for env vars).
 */
export function normalizeDuration(value: unknown, fallback: number): number;
export function normalizeDuration(value: unknown, fallback?: number): number | undefined;
export function normalizeDuration(value: unknown, fallback?: number): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.floor(parsed));
    }
  }
  return fallback;
}
