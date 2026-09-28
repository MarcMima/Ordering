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
  /** Kitchen notes on those corrections, newest first, deduplicated (max 3). */
  notes: string[];
};

export type SuggestionDecision = {
  prep_item_id: string;
  created_at: string;
};

/** How many corrected days before we propose a change. */
export const SUGGESTION_MIN_OCCURRENCES = 3;
/** Ignore differences smaller than this share of the current base. */
export const SUGGESTION_MIN_RELATIVE_CHANGE = 0.15;
/** Never propose more than this factor up or down in one step; repeated learning converges. */
export const SUGGESTION_MAX_STEP_FACTOR = 1.5;

/**
 * A note that describes a habit rather than a one-off ("we always make 3", "never enough on
 * Fridays") is a structural signal, even when the chip picked was "Event".
 */
const STRUCTURAL_NOTE =
  /\b(always|usually|normally|every\s*(day|time|shift|week|morning)|each\s*day|daily|standard|never\s+enough|too\s+(little|much|few|many)|we\s+(always\s+)?(make|need|prep))\b/i;

export function isStructuralNote(note: string | null | undefined): boolean {
  return !!note && STRUCTURAL_NOTE.test(note);
}

/** Does this correction say something about the model (as opposed to a one-off)? */
export function countsAsStructural(a: Pick<PrepListAdjustment, "reason" | "reason_note">): boolean {
  if (a.reason === "event") return isStructuralNote(a.reason_note);
  return true;
}

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

/** Stock count of one prep item on one day (daily_prep_counts). */
export type PrepCount = { prep_item_id: string; date: string; quantity: number };

function nextDayIso(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Work back from one kitchen correction to the base quantity that matches what was really
 * used that day. The base is daily usage at full capacity (ordering multiplies it straight
 * into daily need), so we learn from usage, not from what the kitchen keeps on hand:
 *   used = stock at edit + made − next day's count, base ≈ used / multiplier.
 * Until 28-09-2026 this used (stock + made) / multiplier, i.e. the on-hand level. Kitchens keep
 * 2–3 days of e.g. Medi salad on hand, so bases went ×3 and ordering bought 100 kg of aubergine.
 * Returns null without a next-day count or snapshot (rows from before migration 219).
 */
export function impliedBaseFromAdjustment(
  a: PrepListAdjustment,
  nextDayCount: number | null | undefined
): number | null {
  const mult = a.revenue_multiplier != null ? Number(a.revenue_multiplier) : null;
  const stock = a.stock_at_edit != null ? Number(a.stock_at_edit) : null;
  if (mult == null || mult <= 0 || stock == null) return null;
  const make = a.removed ? 0 : a.make_override != null ? Number(a.make_override) : null;
  if (make == null || nextDayCount == null || !Number.isFinite(nextDayCount)) return null;
  const used = stock + make - nextDayCount;
  // Negative usage means the planned batch was not (yet) made that day; says nothing about need.
  if (used < 0) return null;
  return used / mult;
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
  /** Daily prep counts over the same window; the next day's count gives real usage. */
  counts: PrepCount[];
}): BaseSuggestion[] {
  const { adjustments, locationPrepItems, decisions, counts } = params;
  const countByItemDate = new Map<string, number>();
  for (const c of counts) countByItemDate.set(`${c.prep_item_id}|${c.date}`, Number(c.quantity));
  const lastDecisionAt: Record<string, string> = {};
  for (const d of decisions) {
    const prev = lastDecisionAt[d.prep_item_id];
    if (!prev || d.created_at > prev) lastDecisionAt[d.prep_item_id] = d.created_at;
  }

  const byItem: Record<
    string,
    { implied: number[]; dates: Set<string>; notes: { at: string; text: string }[] }
  > = {};
  for (const a of adjustments) {
    if (!a.prep_item_id) continue;
    if (!countsAsStructural(a)) continue;
    const cutoff = lastDecisionAt[a.prep_item_id];
    if (cutoff && (a.updated_at ?? a.created_at ?? "") <= cutoff) continue;
    const implied = impliedBaseFromAdjustment(
      a,
      countByItemDate.get(`${a.prep_item_id}|${nextDayIso(a.date)}`)
    );
    if (implied == null) continue;
    const bucket = (byItem[a.prep_item_id] ??= { implied: [], dates: new Set(), notes: [] });
    bucket.implied.push(implied);
    bucket.dates.add(a.date);
    const note = a.reason_note?.trim();
    if (note) bucket.notes.push({ at: a.updated_at ?? a.created_at ?? a.date, text: note });
  }

  const out: BaseSuggestion[] = [];
  for (const row of locationPrepItems) {
    const bucket = byItem[row.prep_item_id];
    if (!bucket || bucket.dates.size < SUGGESTION_MIN_OCCURRENCES) continue;
    const currentBase = Number(row.base_quantity ?? 1);
    const learned = median(bucket.implied);
    const lo = currentBase / SUGGESTION_MAX_STEP_FACTOR;
    const hi = currentBase * SUGGESTION_MAX_STEP_FACTOR;
    const suggested = roundBase(Math.min(hi, Math.max(lo, learned)));
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
      notes: [
        ...new Set(
          [...bucket.notes].sort((x, y) => y.at.localeCompare(x.at)).map((n) => n.text)
        ),
      ].slice(0, 3),
    });
  }
  out.sort((a, b) => b.occurrences - a.occurrences || a.name.localeCompare(b.name));
  return out;
}
