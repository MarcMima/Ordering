import type { PrepItemIngredientRow } from "@/lib/calculations";
import type { PrepItemYieldMeta } from "@/lib/prepRecipeYield";

/**
 * Raw ingredients whose on-hand **finished prep** stock reduces daily raw order need
 * (prep count × recipe qty per container). All other prep→raw links are ignored here.
 */
export const PREP_STOCK_RAW_CREDIT_RAW_NAMES = new Set([
  "aubergine",
  "romaine lettuce",
  "lettuce",
  "lemon juice",
  "greek yoghurt 10%",
  "yoghurt",
  "greek yogurt 10%",
  "red onion sliced fine",
  "red cabbage shredded",
  "pomegranate seeds",
  "feta cheese",
]);

function normName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
}

export function isRawOnPrepStockCreditWhitelist(rawName: string | null | undefined): boolean {
  return PREP_STOCK_RAW_CREDIT_RAW_NAMES.has(normName(rawName));
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

/** Raw base units (g/ml/pcs) covered by whitelisted finished prep on hand. */
export function computeRawCoveredByFinishedPrep(params: {
  recipeFiltered: PrepItemIngredientRow[];
  prepStockByPrepItemId: Record<string, number>;
  rawNameByRawId: Record<string, string>;
  prepYieldByPrepItemId?: Record<string, PrepItemYieldMeta>;
  /** Only credit when stocktake section 1 is complete for the date. */
  prepStocktakeComplete: boolean;
}): Record<string, number> {
  const {
    recipeFiltered,
    prepStockByPrepItemId,
    rawNameByRawId,
    prepYieldByPrepItemId,
    prepStocktakeComplete,
  } = params;
  const covered: Record<string, number> = {};
  if (!prepStocktakeComplete) return covered;

  for (const row of recipeFiltered) {
    const rawName = rawNameByRawId[row.raw_ingredient_id];
    if (!isRawOnPrepStockCreditWhitelist(rawName)) continue;
    const prepCount = prepStockByPrepItemId[row.prep_item_id] ?? 0;
    if (prepCount <= 0) continue;
    const factor = yieldFactorForPrep(row.prep_item_id, prepYieldByPrepItemId);
    const add = prepCount * row.quantity_per_unit * factor;
    covered[row.raw_ingredient_id] = (covered[row.raw_ingredient_id] ?? 0) + add;
  }
  return covered;
}

/** Subtract whitelisted finished-prep coverage from baseline daily raw need. */
export function applyPrepStockCreditToDailyRawNeed(params: {
  dailyRawNeedBase: Record<string, number>;
  rawCoveredByFinishedPrep: Record<string, number>;
  whitelistedRawIds: Iterable<string>;
}): Record<string, number> {
  const { dailyRawNeedBase, rawCoveredByFinishedPrep, whitelistedRawIds } = params;
  const out = { ...dailyRawNeedBase };
  for (const rawId of whitelistedRawIds) {
    const covered = rawCoveredByFinishedPrep[rawId] ?? 0;
    if (covered <= 0) continue;
    out[rawId] = Math.max(0, (out[rawId] ?? 0) - covered);
  }
  return out;
}
