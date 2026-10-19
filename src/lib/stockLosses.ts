import type { SupabaseClient } from "@supabase/supabase-js";

/** Waste / stock losses (migration 260). Quantity: base units for raw, containers for prep. */
export type StockLoss = {
  id: string;
  location_id: string;
  date: string;
  raw_ingredient_id: string | null;
  prep_item_id: string | null;
  quantity: number;
  unit_label: string | null;
  reason: LossReason;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export const LOSS_REASONS = [
  { value: "equipment_failure", label: "Fridge / equipment failure" },
  { value: "spoiled_expired", label: "Spoiled / expired" },
  { value: "dropped_damaged", label: "Dropped / damaged" },
  { value: "quality", label: "Quality issue" },
  { value: "other", label: "Other" },
] as const;

export type LossReason = (typeof LOSS_REASONS)[number]["value"];

export function lossReasonLabel(value: string): string {
  return LOSS_REASONS.find((r) => r.value === value)?.label ?? value;
}

export async function loadStockLossesSince(
  supabase: SupabaseClient,
  locationId: string,
  sinceDate: string
): Promise<StockLoss[]> {
  const { data, error } = await supabase
    .from("stock_losses")
    .select("*")
    .eq("location_id", locationId)
    .gte("date", sinceDate)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as StockLoss[]) ?? [];
}

/** When an item was last counted: count date and the moment that count was saved. */
export type CountMoment = { date: string; savedAt: string | null };

/**
 * Subtract losses logged after the latest count from that count, so a fridge breakdown in the
 * afternoon is not still "in stock" for tonight's order and tomorrow's prep list. A loss saved
 * before the count is already in the count and is skipped.
 */
export function deductLossesAfterCount(params: {
  stockById: Record<string, number>;
  countById: Record<string, CountMoment>;
  losses: StockLoss[];
  kind: "raw" | "prep";
}): Record<string, number> {
  const out = { ...params.stockById };
  for (const loss of params.losses) {
    const id = params.kind === "raw" ? loss.raw_ingredient_id : loss.prep_item_id;
    if (!id || out[id] == null) continue;
    const count = params.countById[id];
    if (!count || loss.date < count.date) continue;
    if (loss.date === count.date && count.savedAt && loss.created_at <= count.savedAt) continue;
    out[id] = Math.max(0, out[id] - Number(loss.quantity));
  }
  return out;
}
