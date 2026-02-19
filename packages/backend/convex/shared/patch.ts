/**
 * Builds a patch object from partial args, handling nullable field unsetting.
 *
 * - `undefined` values are skipped (field not changed)
 * - `null` values are converted to `undefined` (field unset in Convex)
 * - All other values are passed through
 * - Custom transforms can override specific keys (e.g. JSON-serializing triggers)
 */
export function buildPatchData(
  patch: Record<string, unknown>,
  transforms?: Record<string, (value: unknown) => Record<string, unknown>>,
): Record<string, unknown> {
  const patchData: Record<string, unknown> = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) {
      patchData[key] = undefined;
      continue;
    }

    if (transforms?.[key]) {
      Object.assign(patchData, transforms[key](value));
    } else {
      patchData[key] = value;
    }
  }

  return patchData;
}
