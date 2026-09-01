/**
 * Incidentele redenen waarom een besteld aantal afwijkt van de suggestie (migratie 208).
 *
 * Bewust géén optie "klopt structureel niet": of iets structureel is blijkt uit herhaling
 * en wordt door de patroondetectie bepaald, niet door een vinkje van de manager. Een
 * afwijking zónder reden is daarmee juist het structurele signaal.
 */
export const ADJUSTMENT_REASONS = [
  { value: "promo", label: "Promotie/actie" },
  { value: "event", label: "Evenement/feest" },
  { value: "weather", label: "Weer" },
  { value: "delivery_issue", label: "Leverprobleem/kwaliteit" },
  { value: "other", label: "Anders…" },
] as const;

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]["value"];

/** Label voor weergave; onbekende waarden komen ongewijzigd terug. */
export function adjustmentReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return ADJUSTMENT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}
