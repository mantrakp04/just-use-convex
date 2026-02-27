/**
 * Parse and clamp an unknown value to a positive integer.
 * Handles both number and string inputs (useful for env vars).
 */
export function normalizePositiveInt(value: unknown, fallback: number): number;
export function normalizePositiveInt(value: unknown, fallback?: number): number | undefined;
export function normalizePositiveInt(value: unknown, fallback?: number): number | undefined {
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
