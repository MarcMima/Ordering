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
  // Chicken is bought in marinated; counted Grilled chicken bags (10 kg raw each,
  // via the recipe link) reduce the raw "Marinated chicken" order need.
  "marinated chicken",
  "chicken",
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
    { prepName: "pickled cabbage", rawName: "red cabbage shredded", gramsPerPrepUnit: 2500 },
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

/** One finished prep item's claim on a raw ingredient (see {@link computeGeneralPrepCreditParts}). */
export type PrepCreditPart = {
  /** Share of the raw's daily need that comes from this prep item (0–1). */
  shareOfDailyNeed: number;
  /** Raw base units already inside the finished prep on hand. */
  credit: number;
};

/**
 * Finished prep on hand reduces the raw order for every ingredient, not only the whitelist
 * (Marc, 19-10-2026: 3 containers of soup at Pijp, yet carrots were suggested). Returned per prep
 * item, so the order can cap each credit at that prep item's own share of the need: soup stock
 * covers the soup carrots but cannot wipe out carrots needed for other dishes (the reason the
 * whitelist had same-name-only rules). Whitelisted and pickled raws keep their own credit.
 */
export function computeGeneralPrepCreditParts(params: {
  recipeFiltered: PrepItemIngredientRow[];
  prepStockByPrepItemId: Record<string, number>;
  neededByPrepItemId: Record<string, number>;
  dailyRawNeedBase: Record<string, number>;
  rawNameByRawId: Record<string, string>;
  prepYieldByPrepItemId?: Record<string, PrepItemYieldMeta>;
}): Record<string, PrepCreditPart[]> {
  // Raws with their own finished-prep credit elsewhere; crediting them here would count twice.
  const ownCreditRaws = new Set([
    ...PICKLED_PREP_RAW_CREDIT_RULES.map((r) => r.rawName),
    ...CROSS_PREP_RAW_CREDIT.map((r) => r.rawName),
    "pita bread 15 cm", // applyCombinedPitaStockCredit
    "whole wheat pita bread 15 cm",
    "frozen flatbreads", // computeDefrostedFlatbreadRawCredit
  ]);
  const out: Record<string, PrepCreditPart[]> = {};
  for (const row of params.recipeFiltered) {
    const rawName = normName(params.rawNameByRawId[row.raw_ingredient_id]);
    if (isRawOnPrepStockCreditWhitelist(rawName) || ownCreditRaws.has(rawName)) continue;
    const prepCount = params.prepStockByPrepItemId[row.prep_item_id] ?? 0;
    const totalDaily = params.dailyRawNeedBase[row.raw_ingredient_id] ?? 0;
    if (prepCount <= 0 || totalDaily <= 0) continue;
    const perContainer = row.quantity_per_unit * yieldFactorForPrep(row.prep_item_id, params.prepYieldByPrepItemId);
    const dailyFromPrep = (params.neededByPrepItemId[row.prep_item_id] ?? 0) * perContainer;
    if (perContainer <= 0 || dailyFromPrep <= 0) continue;
    (out[row.raw_ingredient_id] ??= []).push({
      shareOfDailyNeed: Math.min(1, dailyFromPrep / totalDaily),
      credit: prepCount * perContainer,
    });
  }
  return out;
}
