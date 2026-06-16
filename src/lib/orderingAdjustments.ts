import type { PrepItemIngredientRow } from "@/lib/calculations";
import { calcNeededQuantity, calcToMake } from "@/lib/calculations";
import type { RawIngredient } from "@/lib/types";
import type { PrepItemYieldMeta } from "@/lib/prepRecipeYield";

const MEDI_SALAD_RAW_NAME = "medi salad 3kg";
const MEDI_SALAD_TUB_G = 3000;

/** Production location IDs that order the VG medi salad tub (name check is fallback). */
const MEDI_SALAD_VG_TUB_LOCATION_IDS = new Set([
  "ffcc1a45-82c3-46ea-97bb-74f94db45c68", // Mima Pijp
  "59f20987-be63-4579-b447-2ede73320a1b", // Mima Zuidas
]);

/** Pijp + Zuidas: order VG brunoise tub instead of loose cucumber + tomato for medi salad prep. */
export function locationUsesVanGelderMediSaladTub(
  locationName: string | null | undefined,
  locationId?: string | null
): boolean {
  if (locationId && MEDI_SALAD_VG_TUB_LOCATION_IDS.has(locationId)) return true;
  const n = (locationName ?? "").toLowerCase();
  return n.includes("pijp") || n.includes("zuidas");
}

function normName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
}

function rawIdByName(rawIngredients: RawIngredient[], name: string): string | null {
  const want = normName(name);
  return rawIngredients.find((r) => normName(r.name) === want)?.id ?? null;
}

/** Scale daily raw need before cover-window / pack math (kitchen calibration Jun 2026). */
export const DAILY_NEED_MULTIPLIER_BY_RAW_NAME: Record<string, number> = {
  "romaine lettuce": 0.5,
  aubergine: 0.6,
  "medi salad 3kg": 0.8,
  cucumber: 0.8,
  "red onion sliced fine": 0.7,
  "red cabbage shredded": 0.6,
};

const PARSLEY_RAW_NAME = "parsley";
const PARSLEY_BOX_G = 4000;
const PARSLEY_ADDON_G = 1000;
const GARLIC_PEELED_RAW_NAME = "garlic peeled";
const GARLIC_PEELED_ORDER_THRESHOLD_G = 250;

/** Only suggest orders when linked prep still needs production (toMake > 0). */
export const PRODUCTION_GATED_RAW_NAMES = new Set([
  "green chili",
  "carrot julienne",
]);

export function applyProductionGatedRawDailyNeed(params: {
  dailyRawNeed: Record<string, number>;
  rawIngredients: RawIngredient[];
  recipeFiltered: PrepItemIngredientRow[];
  locationPrepItems: {
    prep_item_id: string;
    base_quantity?: number | null;
    prep_items?: { batch_size?: number | null } | null;
  }[];
  prepStockByPrepItemId: Record<string, number>;
  revenueMultiplier: number;
}): Record<string, number> {
  const {
    dailyRawNeed,
    rawIngredients,
    recipeFiltered,
    locationPrepItems,
    prepStockByPrepItemId,
    revenueMultiplier,
  } = params;
  const toMakeByPrepId: Record<string, number> = {};
  for (const row of locationPrepItems) {
    const needed = calcNeededQuantity({
      baseQuantity: row.base_quantity ?? 0,
      revenueMultiplier,
    });
    const toMake = calcToMake({
      needed,
      currentStock: prepStockByPrepItemId[row.prep_item_id] ?? 0,
      batchSize: row.prep_items?.batch_size ?? null,
    });
    toMakeByPrepId[row.prep_item_id] = toMake;
  }

  const out = { ...dailyRawNeed };
  for (const ing of rawIngredients) {
    if (!PRODUCTION_GATED_RAW_NAMES.has(normName(ing.name))) continue;
    const linkedPrepIds = [
      ...new Set(
        recipeFiltered
          .filter((r) => r.raw_ingredient_id === ing.id)
          .map((r) => r.prep_item_id)
      ),
    ];
    const anyToMake = linkedPrepIds.some((pid) => (toMakeByPrepId[pid] ?? 0) > 0);
    if (!anyToMake) out[ing.id] = 0;
  }
  return out;
}

/** Drop production-gated lines after cover-window math (safety net). */
export function applyProductionGatedBaseSuggested(params: {
  baseSuggested: Record<string, number>;
  rawIngredients: RawIngredient[];
  gatedRawIdsWithZeroNeed: ReadonlySet<string>;
}): Record<string, number> {
  const out = { ...params.baseSuggested };
  for (const ing of params.rawIngredients) {
    if (!PRODUCTION_GATED_RAW_NAMES.has(normName(ing.name))) continue;
    if (params.gatedRawIdsWithZeroNeed.has(ing.id)) delete out[ing.id];
  }
  return out;
}

/** Max suggested order in base units (g/ml/pcs) per delivery. */
export const MAX_ORDER_BASE_BY_RAW_NAME: Record<string, number> = {
  "carrot julienne": 1000,
};

/** Only suggest an order when unrounded pack count reaches this value (e.g. 10 = order when need > 9). */
export const MIN_ORDER_PACKS_BY_RAW_NAME: Record<string, number> = {
  "romaine lettuce": 10,
};

export function passesMinOrderPackThreshold(
  rawName: string | null | undefined,
  packCount: number
): boolean {
  const min = MIN_ORDER_PACKS_BY_RAW_NAME[normName(rawName)];
  if (min == null) return packCount > 0;
  return packCount >= min;
}

export function applyMediSaladVanGelderOverride(params: {
  locationId?: string | null;
  locationName: string | null | undefined;
  dailyRawNeed: Record<string, number>;
  neededByPrepItemId: Record<string, number>;
  recipeFiltered: PrepItemIngredientRow[];
  rawIngredients: RawIngredient[];
  prepYieldByPrepItemId: Record<string, PrepItemYieldMeta>;
  mediSaladPrepItemId: string | null;
}): Record<string, number> {
  const {
    locationId,
    locationName,
    dailyRawNeed,
    neededByPrepItemId,
    recipeFiltered,
    rawIngredients,
    prepYieldByPrepItemId,
    mediSaladPrepItemId,
  } = params;
  if (!locationUsesVanGelderMediSaladTub(locationName, locationId)) {
    return dailyRawNeed;
  }

  const cucumberId = rawIdByName(rawIngredients, "Cucumber");
  const tomatoId = rawIdByName(rawIngredients, "Tomato");
  const mediRawId = rawIdByName(rawIngredients, MEDI_SALAD_RAW_NAME);
  const out = { ...dailyRawNeed };

  if (!mediSaladPrepItemId) {
    if (tomatoId) out[tomatoId] = 0;
    return out;
  }

  const needPrep = neededByPrepItemId[mediSaladPrepItemId] ?? 0;
  if (needPrep <= 0) {
    if (tomatoId) out[tomatoId] = 0;
    return out;
  }

  for (const row of recipeFiltered) {
    if (row.prep_item_id !== mediSaladPrepItemId) continue;
    if (row.raw_ingredient_id !== cucumberId && row.raw_ingredient_id !== tomatoId) continue;
    let factor = 1;
    const meta = prepYieldByPrepItemId[row.prep_item_id];
    if (meta?.ingredientQtyPerRecipeBatch) {
      const { nominalG, recipeG } = meta;
      if (
        nominalG != null &&
        recipeG != null &&
        nominalG > 0 &&
        recipeG > 0 &&
        Number.isFinite(nominalG) &&
        Number.isFinite(recipeG)
      ) {
        factor = nominalG / recipeG;
      }
    }
    const fromMedi = needPrep * row.quantity_per_unit * factor;
    out[row.raw_ingredient_id] = Math.max(0, (out[row.raw_ingredient_id] ?? 0) - fromMedi);
  }

  // Raw tomato is only used for in-house medi salad; at Pijp/Zuidas it is replaced entirely by the VG tub.
  if (tomatoId) out[tomatoId] = 0;

  if (mediRawId) {
    out[mediRawId] = (out[mediRawId] ?? 0) + needPrep * MEDI_SALAD_TUB_G;
  }

  return out;
}

/** Safety net after cover-window math: drop loose tomato; ensure VG medi tub is ordered. */
export function applyMediSaladBaseSuggestedCleanup(params: {
  locationId?: string | null;
  locationName: string | null | undefined;
  baseSuggested: Record<string, number>;
  rawIngredients: RawIngredient[];
  mediSaladPrepItemId: string | null;
  mediSaladNeedPrep: number;
}): Record<string, number> {
  const {
    locationId,
    locationName,
    baseSuggested,
    rawIngredients,
    mediSaladPrepItemId,
    mediSaladNeedPrep,
  } = params;
  if (!locationUsesVanGelderMediSaladTub(locationName, locationId)) {
    return baseSuggested;
  }
  const out = { ...baseSuggested };
  const tomatoId = rawIdByName(rawIngredients, "Tomato");
  if (tomatoId) delete out[tomatoId];
  if (!mediSaladPrepItemId || mediSaladNeedPrep <= 0) {
    return out;
  }
  const mediRawId = rawIdByName(rawIngredients, MEDI_SALAD_RAW_NAME);
  if (mediRawId) {
    const existing = out[mediRawId] ?? 0;
    if (existing <= 0) {
      out[mediRawId] = Math.max(existing, mediSaladNeedPrep * MEDI_SALAD_TUB_G);
    }
  }
  return out;
}

/** Last line of defence: never ship loose tomato on Pijp/Zuidas supplier cards. */
export function applyMediSaladSuggestedPacksCleanup(params: {
  locationId?: string | null;
  locationName: string | null | undefined;
  suggestedPacks: Record<string, number>;
  kindByRaw: Record<string, string>;
  rawIngredients: RawIngredient[];
  mediSaladNeedPrep: number;
}): { suggestedPacks: Record<string, number>; kindByRaw: Record<string, string> } {
  const { locationId, locationName, suggestedPacks, kindByRaw, rawIngredients, mediSaladNeedPrep } =
    params;
  if (!locationUsesVanGelderMediSaladTub(locationName, locationId)) {
    return { suggestedPacks, kindByRaw };
  }
  const out = { ...suggestedPacks };
  const kindOut = { ...kindByRaw };
  const tomatoId = rawIdByName(rawIngredients, "Tomato");
  if (tomatoId) {
    delete out[tomatoId];
    delete kindOut[tomatoId];
  }
  if (mediSaladNeedPrep > 0) {
    const mediRawId = rawIdByName(rawIngredients, MEDI_SALAD_RAW_NAME);
    if (mediRawId && (out[mediRawId] ?? 0) <= 0) {
      out[mediRawId] = Math.max(1, mediSaladNeedPrep);
      kindOut[mediRawId] = kindOut[mediRawId] ?? "pack";
    }
  }
  return { suggestedPacks: out, kindByRaw: kindOut };
}

/** Apply per-ingredient daily-need multipliers (after prep aggregation, before ordering math). */
export function applyDailyNeedMultipliers(params: {
  dailyRawNeed: Record<string, number>;
  rawIngredients: RawIngredient[];
}): Record<string, number> {
  const out = { ...params.dailyRawNeed };
  for (const ing of params.rawIngredients) {
    const mult = DAILY_NEED_MULTIPLIER_BY_RAW_NAME[normName(ing.name)];
    if (mult == null || mult === 1) continue;
    const cur = out[ing.id];
    if (cur != null && cur > 0) out[ing.id] = cur * mult;
  }
  return out;
}

/** Garlic peeled: only suggest when stock is below 250 g. */
export function applyGarlicPeeledOrderGate(params: {
  rawIngredients: RawIngredient[];
  currentRawStock: Record<string, number>;
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  const garlicId = rawIdByName(params.rawIngredients, GARLIC_PEELED_RAW_NAME);
  if (!garlicId) return params.baseSuggested;
  const stock = params.currentRawStock[garlicId] ?? 0;
  if (stock >= GARLIC_PEELED_ORDER_THRESHOLD_G) {
    const out = { ...params.baseSuggested };
    delete out[garlicId];
    return out;
  }
  return params.baseSuggested;
}

/** Parsley: 4 kg boxes as base unit; above that, add 1 kg packs for the remainder. */
export function parsleyOrderSplit(baseGrams: number): { box4kg: number; bag1kg: number } {
  if (baseGrams <= 0) return { box4kg: 0, bag1kg: 0 };
  let boxes = Math.floor(baseGrams / PARSLEY_BOX_G);
  const remainder = baseGrams - boxes * PARSLEY_BOX_G;
  if (boxes === 0) boxes = 1;
  const bag1kg = remainder > 0 ? Math.ceil(remainder / PARSLEY_ADDON_G) : 0;
  return { box4kg: boxes, bag1kg };
}

export function isParsleyRawName(name: string | null | undefined): boolean {
  return normName(name) === PARSLEY_RAW_NAME;
}

export function applyMaxOrderBaseCaps(params: {
  rawIngredients: RawIngredient[];
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  const { rawIngredients, baseSuggested } = params;
  const out = { ...baseSuggested };
  for (const ing of rawIngredients) {
    const cap = MAX_ORDER_BASE_BY_RAW_NAME[normName(ing.name)];
    if (cap == null) continue;
    const cur = out[ing.id];
    if (cur != null && cur > cap) out[ing.id] = cap;
  }
  return out;
}

/** Drop lines below minimum pack count (checked on unrounded need, before supplier MOQ rounding). */
export function applyMinOrderPackThresholds(params: {
  rawIngredients: RawIngredient[];
  suggestedPacks: Record<string, number>;
}): Record<string, number> {
  const { rawIngredients, suggestedPacks } = params;
  const out = { ...suggestedPacks };
  for (const ing of rawIngredients) {
    if (!passesMinOrderPackThreshold(ing.name, out[ing.id] ?? 0)) {
      delete out[ing.id];
    }
  }
  return out;
}

/**
 * Weekly items (order_interval_days ≥ 2) without prep-driven need: plan ~1 stocktake unit
 * per interval (e.g. one box per week for GéDé packaging).
 */
export function mergeWeeklyIntervalDailyNeed(params: {
  dailyRawNeed: Record<string, number>;
  rawIngredients: RawIngredient[];
  prepLinkedRawIds: ReadonlySet<string>;
  basePerStocktakeUnitByRawId: Record<string, number | null | undefined>;
  recentCountedRawIds: ReadonlySet<string>;
}): Record<string, number> {
  const out = { ...params.dailyRawNeed };
  for (const ing of params.rawIngredients) {
    const interval = ing.order_interval_days;
    if (interval == null || interval < 2) continue;
    const sd = ing.stocktake_day_of_week;
    if (sd == null || sd < 0 || sd > 6) continue;
    if (params.prepLinkedRawIds.has(ing.id)) continue;
    if (!params.recentCountedRawIds.has(ing.id)) continue;
    if ((out[ing.id] ?? 0) > 0) continue;
    const bps = params.basePerStocktakeUnitByRawId[ing.id];
    if (bps == null || !Number.isFinite(bps) || bps <= 0) continue;
    out[ing.id] = bps / Math.floor(interval);
  }
  return out;
}
