/**
 * Directe visuele feedback voor temperatuurvelden (HACCP).
 * Koeling max °C: groen onder de grens, amber op de grens (±0,1 °C band), rood erboven.
 * Warmte min °C: groen vanaf norm, amber net eronder, rood duidelijk te koud.
 */

export type TempFieldStatus = "empty" | "good" | "warn" | "bad";

const BASE = "input w-full tabular-nums border transition-colors";
const NEUTRAL = "border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-900";
const GOOD =
  "border-emerald-500 bg-emerald-50 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-100";
const WARN =
  "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100";
const BAD =
  "border-red-500 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950/50 dark:text-red-100";

export function temperatureInputClass(status: TempFieldStatus, extra?: string): string {
  const s =
    status === "empty"
      ? NEUTRAL
      : status === "good"
        ? GOOD
        : status === "warn"
          ? WARN
          : BAD;
  return [BASE, s, extra ?? ""].filter(Boolean).join(" ");
}

/** Maximaal X °C (koeling): < norm goed; [norm, norm+0,1) waarschuwing; ≥ norm+0,1 fout. */
export function lteMaxStatus(temp: number | null | undefined, max: number): TempFieldStatus {
  if (temp == null || !Number.isFinite(temp)) return "empty";
  const t = Number(temp);
  if (t < max) return "good";
  if (t < max + 0.1) return "warn";
  return "bad";
}

/** Minimaal X °C (warm): ≥ norm goed; [norm-0,1, norm) waarschuwing; < norm-0,1 fout. */
export function gteMinStatus(temp: number | null | undefined, min: number): TempFieldStatus {
  if (temp == null || !Number.isFinite(temp)) return "empty";
  const t = Number(temp);
  if (t >= min) return "good";
  if (t >= min - 0.1) return "warn";
  return "bad";
}

/** Maximaal X °C bij afkoeling (te warm = fout): zelfde als lteMax. */
export function lteMaxCoolingStatus(temp: number | null | undefined, max: number): TempFieldStatus {
  return lteMaxStatus(temp, max);
}
