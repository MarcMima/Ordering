/**
 * Redenen waarom een besteld aantal afwijkt van de suggestie (migraties 208 + 210).
 *
 * De eerste vier zijn incidenteel: ze verklaren de afwijking weg. "suggestion_off" is
 * dat juist niet — dat is de manager die zegt dat het advies zelf niet klopt, en telt
 * dus zwaarder mee in de patroondetectie. Een afwijking zónder reden blijft eveneens
 * een structureel signaal.
 */
export const ADJUSTMENT_REASONS = [
  { value: "promo", label: "Promotion" },
  { value: "event", label: "Catering/event" },
  { value: "weather", label: "Weather" },
  { value: "delivery_issue", label: "Delivery/quality issue" },
  { value: "suggestion_off", label: "Suggestion seems off" },
  { value: "other", label: "Other…" },
] as const;

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]["value"];

/** Label voor weergave; onbekende waarden komen ongewijzigd terug. */
export function adjustmentReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return ADJUSTMENT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}
