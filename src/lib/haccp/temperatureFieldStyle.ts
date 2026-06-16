/**
 * Directe visuele feedback voor temperatuurvelden (HACCP).
 * Koeling max °C: groen onder de grens, amber op de grens (±0,1 °C band), rood erboven.
 * Warmte min °C: groen vanaf norm, amber net eronder, rood duidelijk te koud.
 */

export type TempFieldStatus = "empty" | "good" | "warn" | "bad";

const BASE = "input w-full tabular-nums border transition-colors";
const NEUTRAL = "border-brand-green/15 bg-surface";
const GOOD = "border-brand-green bg-brand-sage/25 text-brand-green";
const WARN = "border-accent-orange bg-brand-sand/60 text-ink";
const BAD = "border-accent-terracotta bg-brand-sand/50 text-accent-terracotta";

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
