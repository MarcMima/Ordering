/**
 * Calendar date YYYY-MM-DD in the environment local timezone.
 * Use for DB fields tied to "today" (stocktake counts, revenue targets, orders)
 * so they match what users see on the clock — not UTC midnight from `toISOString()`.
 */
export function localCalendarDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Shift a YYYY-MM-DD calendar date by `deltaDays` (local timezone). */
export function shiftCalendarDateString(dateStr: string, deltaDays: number): string {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return localCalendarDateString();
  }
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return localCalendarDateString(dt);
}
