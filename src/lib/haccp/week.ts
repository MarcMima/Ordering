import { addWeeks, getISOWeek, getISOWeekYear, setISOWeek, setISOWeekYear } from "date-fns";

export function getISOWeekAndYear(d: Date): { week: number; year: number } {
  return { week: getISOWeek(d), year: getISOWeekYear(d) };
}

export function parseWeekYearParam(s: string | null): { week: number; year: number } | null {
  if (!s) return null;
  const m = /^(\d{4})-W(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  if (week < 1 || week > 53) return null;
  return { week, year };
}

export function formatWeekYearParam(week: number, year: number): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Move by whole ISO weeks from a known week/year. */
export function shiftWeekYear(week: number, year: number, deltaWeeks: number): { week: number; year: number } {
  let d = new Date(year, 0, 4);
  d = setISOWeekYear(d, year);
  d = setISOWeek(d, week);
  d = addWeeks(d, deltaWeeks);
  return { week: getISOWeek(d), year: getISOWeekYear(d) };
}

export const WEEKDAY_LABELS_NL = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"] as const;
