import type { PrepItemIngredientRow } from "@/lib/calculations";
import type { PrepItemYieldMeta } from "@/lib/prepRecipeYield";

/**
 * Raw ingredients whose on-hand **finished prep** stock reduces order need
 * (prep count × recipe qty per container), applied after cover-window scaling.
 *
 * Whitelisted finished prep on hand reduces order need. Pickled onion/cabbage use
 * {@link computePickledPrepRawCredit} (separate from this whitelist).
 */
export const PREP_STOCK_RAW_CREDIT_RAW_NAMES = new Set([
  "romaine lettuce",
  "lettuce",
  "lemon juice",
  "mint",
  "greek yoghurt 10%",
  "yoghurt",
  "greek yogurt 10%",
  "pomegranate seeds",
  "feta cheese",
  "mango",
  "shifka peppers",
  "kalamata olives",
  "middle eastern pickles",
  "parsley",
  "green chili",
]);

/**
 * These raws only get credit from a finished prep with the **same name**
 * (e.g. Parsley prep GN → parsley raw). Falafel stock must not slash parsley orders.
 */
const PREP_STOCK_CREDIT_SAME_NAME_ONLY = new Set(["parsley", "mint", "green chili"]);

/** Finished prep → pickling raw (GN count × kg per container). */
const PICKLED_PREP_RAW_CREDIT_RULES: { prepName: string; rawName: string; gramsPerPrepUnit: number }[] =
  [
    { prepName: "pickled onion", rawName: "red onion sliced fine", gramsPerPrepUnit: 3000 },
    { prepName: "pickled cabbage", rawName: "red cabbage shredded", gramsPerPrepUnit: 3000 },
  ];

/**
 * Finished prep → raw when names differ.
 * Fresh aubergine (VG) only credits from Sabich — not Baba (that uses Bidfood puree).
 */
const CROSS_PREP_RAW_CREDIT: { prepName: string; rawName: string }[] = [
  { prepName: "srug", rawName: "green chili" },
  { prepName: "aubergine / sabich", rawName: "aubergine" },
];

function normName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim().replace(/\s+/g, " ");
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
  /** prep_item_id → prep name (needed for same-name-only credit rules). */
  prepNameByPrepItemId?: Record<string, string>;
  prepYieldByPrepItemId?: Record<string, PrepItemYieldMeta>;
}): Record<string, number> {
  const {
    recipeFiltered,
    prepStockByPrepItemId,
    rawNameByRawId,
    prepNameByPrepItemId,
    prepYieldByPrepItemId,
  } = params;
  const covered: Record<string, number> = {};

  for (const row of recipeFiltered) {
    const rawName = normName(rawNameByRawId[row.raw_ingredient_id]);
    if (!isRawOnPrepStockCreditWhitelist(rawName)) continue;
    if (PREP_STOCK_CREDIT_SAME_NAME_ONLY.has(rawName)) {
      const prepName = normName(prepNameByPrepItemId?.[row.prep_item_id]);
      if (prepName !== rawName) continue;
    }
    const prepCount = prepStockByPrepItemId[row.prep_item_id] ?? 0;
    if (prepCount <= 0) continue;
    const factor = yieldFactorForPrep(row.prep_item_id, prepYieldByPrepItemId);
    const add = prepCount * row.quantity_per_unit * factor;
    covered[row.raw_ingredient_id] = (covered[row.raw_ingredient_id] ?? 0) + add;
  }
  for (const rule of CROSS_PREP_RAW_CREDIT) {
    for (const row of recipeFiltered) {
      const rawName = normName(rawNameByRawId[row.raw_ingredient_id]);
      if (rawName !== rule.rawName) continue;
      const prepName = normName(prepNameByPrepItemId?.[row.prep_item_id]);
      if (prepName !== rule.prepName) continue;
      const prepCount = prepStockByPrepItemId[row.prep_item_id] ?? 0;
      if (prepCount <= 0) continue;
      const factor = yieldFactorForPrep(row.prep_item_id, prepYieldByPrepItemId);
      const add = prepCount * row.quantity_per_unit * factor;
      covered[row.raw_ingredient_id] = (covered[row.raw_ingredient_id] ?? 0) + add;
    }
  }

  return covered;
}

/** Pickled onion/cabbage containers reduce VG pickling raw orders. */
export function computePickledPrepRawCredit(params: {
  prepItemsById: Record<string, { name?: string | null } | null | undefined>;
  prepStockByPrepItemId: Record<string, number>;
  rawIngredients: { id: string; name?: string | null }[];
}): Record<string, number> {
  const rawIdByName = new Map(
    params.rawIngredients.map((r) => [normName(r.name), r.id] as const)
  );
  const covered: Record<string, number> = {};

  for (const rule of PICKLED_PREP_RAW_CREDIT_RULES) {
    const rawId = rawIdByName.get(rule.rawName);
    if (!rawId) continue;
    for (const [prepItemId, prepCount] of Object.entries(params.prepStockByPrepItemId)) {
      if (prepCount <= 0) continue;
      const prepName = normName(params.prepItemsById[prepItemId]?.name);
      if (prepName !== rule.prepName) continue;
      covered[rawId] = (covered[rawId] ?? 0) + prepCount * rule.gramsPerPrepUnit;
    }
  }

  return covered;
}
