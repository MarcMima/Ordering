import { addWeeks, differenceInCalendarWeeks } from "date-fns";

/** After a passing test with no corrective action, the thermometer module is de-emphasised for this many weeks. */
export const THERMOMETER_QUIET_WEEKS = 10;

/** Max deviation (°C) to count as “within tolerance” without corrective action. */
export const THERMOMETER_MAX_DEVIATION_OK = 1;

export type ThermometerRowLite = {
  datum: string;
  afwijking: number | null;
  maatregel: string | null;
};

export function isPassingThermometerTest(row: ThermometerRowLite | null): boolean {
  if (!row) return false;
  const a = row.afwijking;
  if (a == null || !Number.isFinite(Number(a))) return false;
  if (Number(a) > THERMOMETER_MAX_DEVIATION_OK) return false;
  if (row.maatregel?.trim()) return false;
  return true;
}

/** True when the latest test passed without corrective action and is within the quiet window (still “done” for routine purposes). */
export function isThermometerQuietPeriod(row: ThermometerRowLite | null): boolean {
  if (!row || !isPassingThermometerTest(row)) return false;
  const testDay = new Date(row.datum.slice(0, 10));
  if (Number.isNaN(testDay.getTime())) return false;
  const now = new Date();
  const weeks = differenceInCalendarWeeks(now, testDay);
  return weeks >= 0 && weeks <= THERMOMETER_QUIET_WEEKS;
}

function sameCalendarQuarter(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && Math.floor(a.getMonth() / 3) === Math.floor(b.getMonth() / 3);
}

/** “Done” for overview: passing test this calendar quarter, or still inside quiet period after a pass. */
export function isThermometerRoutineDone(latest: ThermometerRowLite | null): boolean {
  if (!latest) return false;
  if (isThermometerQuietPeriod(latest)) return true;
  if (!isPassingThermometerTest(latest)) return false;
  const d = new Date(latest.datum.slice(0, 10));
  return sameCalendarQuarter(d, new Date());
}

/** Date from which the overview shows the thermometer card prominently again (after the quiet window). */
export function thermometerQuietEndsDate(testDatumIso: string): Date {
  const d = new Date(testDatumIso.slice(0, 10));
  if (Number.isNaN(d.getTime())) return new Date();
  return addWeeks(d, THERMOMETER_QUIET_WEEKS);
}
