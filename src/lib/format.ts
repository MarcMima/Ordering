/**
 * # Number display (Mima Kitchen)
 *
 * **Rule:** at most **one** decimal place where decimals are shown; whole numbers are shown
 * without a fractional part (`2`, not `2.00`).
 *
 * Examples: `2` → `"2"`, `2.55` → `"2.6"`, `2.5` → `"2.5"`.
 *
 * Use {@link formatDecimal2} (or {@link formatPrepQuantity}, {@link formatOrderAmount}) for quantities and ratios.
 * Use {@link formatEuroFromCents} for amounts stored as cents in the database.
 * Do not add raw `.toFixed(...)` in JSX — use these helpers.
 */

/** Quantities, ratios, and other numeric UI: max one decimal; integers without `.0`. */
export function formatDecimal2(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const s = n.toFixed(1);
  if (s.endsWith(".0")) return s.slice(0, -2);
  return s;
}

/** Same as {@link formatDecimal2} — used where ordering UI names “amount” explicitly. */
export function formatOrderAmount(n: number): string {
  return formatDecimal2(n);
}

/** Alias: prep-list / ordering — same as {@link formatDecimal2}. */
export function formatPrepQuantity(n: number): string {
  return formatDecimal2(n);
}

/** Euro amount from cents (no € symbol). Same decimal rule as quantities. */
export function formatEuroFromCents(cents: number): string {
  return formatDecimal2(cents / 100);
}
