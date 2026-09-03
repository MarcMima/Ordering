import type { PrepListAdjustment } from "@/lib/types";

export const ADJUSTMENT_REASONS = [
  { value: "event", label: "Event / catering (one-off)" },
  { value: "model_wrong", label: "App is usually wrong for this item" },
  { value: "stock_wrong", label: "Stock count was wrong" },
  { value: "other", label: "Other" },
] as const;

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]["value"];

export function reasonLabel(value: string | null | undefined): string {
  return ADJUSTMENT_REASONS.find((r) => r.value === value)?.label ?? "";
}

export type BaseSuggestion = {
  prepItemId: string;
  locationPrepItemId: string;
  name: string;
  unit: string | null;
  currentBase: number;
  suggestedBase: number;
  /** Number of days the kitchen corrected this item since the last decision. */
  occurrences: number;
  /** Dates (YYYY-MM-DD) of those corrections, newest first. */
  dates: string[];
};

export type SuggestionDecision = {
  prep_item_id: string;
  created_at: string;
};

/** How many corrected days before we propose a change. */
export const SUGGESTION_MIN_OCCURRENCES = 3;
/** Ignore differences smaller than this share of the current base. */
export const SUGGESTION_MIN_RELATIVE_CHANGE = 0.15;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Round a base quantity to something a kitchen recognises: halves below 10, whole above. */
export function roundBase(n: number): number {
  if (n < 10) return Math.round(n * 2) / 2;
  return Math.round(n);
}

/**
 * Work back from one kitchen correction to the base quantity that would have produced it.
 * needed = base × multiplier and make ≈ needed − stock, so base ≈ (stock + make) / multiplier.
 * Returns null when the snapshot is missing (rows from before migration 219).
 */
export function impliedBaseFromAdjustment(a: PrepListAdjustment): number | null {
  const mult = a.revenue_multiplier != null ? Number(a.revenue_multiplier) : null;
  const stock = a.stock_at_edit != null ? Number(a.stock_at_edit) : null;
  if (mult == null || mult <= 0 || stock == null) return null;
  const make = a.removed ? 0 : a.make_override != null ? Number(a.make_override) : null;
  if (make == null) return null;
  return (stock + make) / mult;
}

/**
 * Structural deviations between model and kitchen, per prep item, since the manager's
 * last decision on that item. One-off reasons (event) never count.
 */
export function computeBaseSuggestions(params: {
  adjustments: PrepListAdjustment[];
  locationPrepItems: {
    id: string;
    prep_item_id: string;
    base_quantity?: number | null;
    prep_items: { name: string; unit?: string | null } | null;
  }[];
  decisions: SuggestionDecision[];
}): BaseSuggestion[] {
  const { adjustments, locationPrepItems, decisions } = params;
  const lastDecisionAt: Record<string, string> = {};
  for (const d of decisions) {
    const prev = lastDecisionAt[d.prep_item_id];
    if (!prev || d.created_at > prev) lastDecisionAt[d.prep_item_id] = d.created_at;
  }

  const byItem: Record<string, { implied: number[]; dates: Set<string> }> = {};
  for (const a of adjustments) {
    if (!a.prep_item_id) continue;
    if (a.reason === "event") continue;
    const cutoff = lastDecisionAt[a.prep_item_id];
    if (cutoff && (a.updated_at ?? a.created_at ?? "") <= cutoff) continue;
    const implied = impliedBaseFromAdjustment(a);
    if (implied == null) continue;
    const bucket = (byItem[a.prep_item_id] ??= { implied: [], dates: new Set() });
    bucket.implied.push(implied);
    bucket.dates.add(a.date);
  }

  const out: BaseSuggestion[] = [];
  for (const row of locationPrepItems) {
    const bucket = byItem[row.prep_item_id];
    if (!bucket || bucket.dates.size < SUGGESTION_MIN_OCCURRENCES) continue;
    const currentBase = Number(row.base_quantity ?? 1);
    const suggested = roundBase(median(bucket.implied));
    const diff = Math.abs(suggested - currentBase);
    if (diff < Math.max(0.5, currentBase * SUGGESTION_MIN_RELATIVE_CHANGE)) continue;
    out.push({
      prepItemId: row.prep_item_id,
      locationPrepItemId: row.id,
      name: row.prep_items?.name ?? "Item",
      unit: row.prep_items?.unit ?? null,
      currentBase,
      suggestedBase: suggested,
      occurrences: bucket.dates.size,
      dates: [...bucket.dates].sort().reverse(),
    });
  }
  out.sort((a, b) => b.occurrences - a.occurrences || a.name.localeCompare(b.name));
  return out;
}
