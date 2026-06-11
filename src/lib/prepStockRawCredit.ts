import type { PrepItemIngredientRow } from "@/lib/calculations";
import type { PrepItemYieldMeta } from "@/lib/prepRecipeYield";

/**
 * Prep items whose on-hand stock must not reduce raw order need.
 * Marinated chicken: crediting raw Chicken from prep counts under-ordered fillet.
 */
export const PREP_STOCK_RAW_CREDIT_EXCLUDED_PREP_NAMES = new Set(["marinated chicken"]);

function normName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
}

export function isPrepStockRawCreditExcluded(prepName: string | null | undefined): boolean {
  return PREP_STOCK_RAW_CREDIT_EXCLUDED_PREP_NAMES.has(normName(prepName));
}

function yieldFactorForPrep(
  prepItemId: string,
  prepYieldByPrepItemId?: Record<string, PrepItemYieldMeta>
): number {
  const meta = prepYieldByPrepItemId?.[prepItemId];
  if (!meta?.ingredientQtyPerRecipeBatch) return 1;
  const { nominalG, recipeG } = meta;
  if (
    nominalG != null &&
    recipeG != null &&
    nominalG > 0 &&
    recipeG > 0 &&
    Number.isFinite(nominalG) &&
    Number.isFinite(recipeG)
  ) {
    return nominalG / recipeG;
  }
  return 1;
}

/** Raw base units (g/ml/pcs) already covered by finished prep on hand. */
export function computeRawCoveredByFinishedPrep(params: {
  recipeFiltered: PrepItemIngredientRow[];
  prepStockByPrepItemId: Record<string, number>;
  prepNameByPrepItemId: Record<string, string>;
  prepYieldByPrepItemId?: Record<string, PrepItemYieldMeta>;
}): Record<string, number> {
  const { recipeFiltered, prepStockByPrepItemId, prepNameByPrepItemId, prepYieldByPrepItemId } =
    params;
  const covered: Record<string, number> = {};
  for (const row of recipeFiltered) {
    const prepName = prepNameByPrepItemId[row.prep_item_id];
    if (isPrepStockRawCreditExcluded(prepName)) continue;
    const prepCount = prepStockByPrepItemId[row.prep_item_id] ?? 0;
    if (prepCount <= 0) continue;
    const factor = yieldFactorForPrep(row.prep_item_id, prepYieldByPrepItemId);
    const add = prepCount * row.quantity_per_unit * factor;
    covered[row.raw_ingredient_id] = (covered[row.raw_ingredient_id] ?? 0) + add;
  }
  return covered;
}

/** Subtract finished-prep coverage from baseline daily raw need (per raw ingredient). */
export function applyPrepStockCreditToDailyRawNeed(params: {
  dailyRawNeedBase: Record<string, number>;
  rawCoveredByFinishedPrep: Record<string, number>;
}): Record<string, number> {
  const { dailyRawNeedBase, rawCoveredByFinishedPrep } = params;
  const out = { ...dailyRawNeedBase };
  for (const [rawId, covered] of Object.entries(rawCoveredByFinishedPrep)) {
    if (covered <= 0) continue;
    out[rawId] = Math.max(0, (out[rawId] ?? 0) - covered);
  }
  return out;
}
