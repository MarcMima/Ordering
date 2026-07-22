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

/** Weekly stocktake + order_interval_days (e.g. GéDé packaging). */
export function isWeeklyPlannedRaw(ing: {
  order_interval_days?: number | null;
  stocktake_day_of_week?: number | null;
}): boolean {
  const interval = ing.order_interval_days;
  if (interval == null || interval < 2) return false;
  const sd = ing.stocktake_day_of_week;
  return sd != null && sd >= 0 && sd <= 6;
}

export type StockCountRow = {
  raw_ingredient_id: string;
  quantity: number;
  date: string;
};

/**
 * Stock for ordering on `todayDateStr`:
 * - Prefer today's count when present.
 * - Otherwise use the latest count on or before that date (carry-forward).
 * Weekly-planned raws use the same fallback within the loaded window.
 */
export function buildOrderingStockByRawId(params: {
  rows: StockCountRow[];
  todayDateStr: string;
  rawIngredients: { id: string; order_interval_days?: number | null; stocktake_day_of_week?: number | null }[];
}): Record<string, number> {
  const todayByRaw: Record<string, number> = {};
  const latestOnOrBefore: Record<string, { date: string; quantity: number }> = {};

  for (const row of params.rows) {
    if (row.date > params.todayDateStr) continue;
    const rid = row.raw_ingredient_id;
    const qty = Number(row.quantity);
    if (!Number.isFinite(qty)) continue;

    if (row.date === params.todayDateStr) {
      todayByRaw[rid] = qty;
    }

    const prev = latestOnOrBefore[rid];
    if (!prev || row.date > prev.date) {
      latestOnOrBefore[rid] = { date: row.date, quantity: qty };
    }
  }

  const out: Record<string, number> = {};
  for (const ing of params.rawIngredients) {
    const rid = ing.id;
    if (todayByRaw[rid] != null) {
      out[rid] = todayByRaw[rid]!;
      continue;
    }
    const latest = latestOnOrBefore[rid];
    if (latest) out[rid] = latest.quantity;
  }
  return out;
}
