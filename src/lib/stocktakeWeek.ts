/** Matches JS `Date.getDay()`: 0 = Sunday … 6 = Saturday (same as Admin raw ingredient weekday). */
export const JS_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function jsWeekdayFromCalendarDate(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return new Date().getDay();
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).getDay();
}

/**
 * Which weekday weekly counts are due: location policy wins when set, else ingredient.
 */
export function effectiveWeeklyStocktakeDow(
  locationWeeklyDow: number | null | undefined,
  ingredientWeeklyDow: number | null | undefined
): number | null {
  if (locationWeeklyDow != null && locationWeeklyDow >= 0 && locationWeeklyDow <= 6) {
    return locationWeeklyDow;
  }
  if (ingredientWeeklyDow != null && ingredientWeeklyDow >= 0 && ingredientWeeklyDow <= 6) {
    return ingredientWeeklyDow;
  }
  return null;
}

export function isWeeklyStocktakeDueOnDate(params: {
  dateStr: string;
  locationWeeklyDow: number | null | undefined;
  ingredientWeeklyDow: number | null | undefined;
}): boolean {
  const scheduled = effectiveWeeklyStocktakeDow(params.locationWeeklyDow, params.ingredientWeeklyDow);
  if (scheduled == null) return false;
  return jsWeekdayFromCalendarDate(params.dateStr) === scheduled;
}
