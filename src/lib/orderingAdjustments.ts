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

const ZUIDAS_LOCATION_IDS = new Set([
  "59f20987-be63-4579-b447-2ede73320a1b", // Mima Zuidas
]);

export function isZuidasLocation(
  locationName: string | null | undefined,
  locationId?: string | null
): boolean {
  if (locationId && ZUIDAS_LOCATION_IDS.has(locationId)) return true;
  return (locationName ?? "").toLowerCase().includes("zuidas");
}

const ZUIDAS_DAILY_NEED_MULTIPLIER_BY_RAW_NAME: Record<string, number> = {};

/** Minimum order packs when the suggestion would otherwise be zero (Zuidas). */
const ZUIDAS_STANDING_ORDER_PACKS_BY_RAW_NAME: Record<string, number> = {
  cauliflower: 2,
};

const MEDI_SALAD_VG_ORDER_PAIR = 2;

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
  aubergine: 1.014,
  "medi salad 3kg": 0.8,
  "red onion sliced fine": 0.7,
  "red cabbage shredded": 0.6,
};

/** Summer drink uplift (still/sparkling water, cola, SOOF). */
const SUMMER_DRINK_MULTIPLIER = 2;

const DRINK_RAW_NAME_SUBSTRINGS = [
  "coca cola",
  "still water",
  "sparkling water",
  "soof mint",
  "soof cardamom",
] as const;

function isDrinkRawName(name: string | null | undefined): boolean {
  const n = normName(name);
  return DRINK_RAW_NAME_SUBSTRINGS.some((s) => n.includes(s));
}

/** Mima Amsterdam / West — location-specific calibration (Jun 2026). */
const WEST_LOCATION_IDS = new Set([
  "ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a",
]);

export function isWestLocation(
  locationName: string | null | undefined,
  locationId?: string | null
): boolean {
  if (locationId && WEST_LOCATION_IDS.has(locationId)) return true;
  const n = (locationName ?? "").toLowerCase();
  return (
    n.includes("west") ||
    n.includes("wester") ||
    n === "mima amsterdam" ||
    n === "mima amsterdam west"
  );
}

const WEST_DAILY_NEED_MULTIPLIER_BY_RAW_NAME: Record<string, number> = {
  "carrot julienne": 2,
};

const PARSLEY_RAW_NAME = "parsley";
const PARSLEY_BOX_G = 4000;
const PARSLEY_ADDON_G = 1000;
const GARLIC_PEELED_RAW_NAME = "garlic peeled";
const GARLIC_PEELED_ORDER_THRESHOLD_G = 250;

/** Only suggest orders when linked prep still needs production (toMake > 0). */
export const PRODUCTION_GATED_RAW_NAMES = new Set(["green chili", "rice parboiled"]);

/** Recipe-book "Coriander" in falafel/srug = fresh herb (Van Gelder), not ground spice. */
const RAW_INGREDIENT_NAME_ALIASES: Record<string, string> = {
  coriander: "coriander (fresh)",
};

export function normRawIngredientName(name: string | null | undefined): string {
  const n = (name ?? "").toLowerCase().trim().replace(/\s+/g, " ");
  return RAW_INGREDIENT_NAME_ALIASES[n] ?? n;
}

/** Prep bought ready-made (not produced from raw in-house) — cover-window math is enough. */
const PREP_BATCH_SHORTFALL_EXCLUDED_PREP_NAMES = new Set(["marinated chicken"]);

type LocationPrepRowForToMake = {
  prep_item_id: string;
  base_quantity?: number | null;
  prep_items?: { name?: string | null; batch_size?: number | null } | null;
};

function yieldFactorForPrepItem(
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

/** Prep still to make: finished prep stock + convertible raw stock (via prep_item_ingredients). */
function computeToMakeByPrepId(params: {
  locationPrepItems: LocationPrepRowForToMake[];
  recipeFiltered: PrepItemIngredientRow[];
  prepStockByPrepItemId: Record<string, number>;
  currentRawStock: Record<string, number>;
  revenueMultiplier: number;
  prepYieldByPrepItemId?: Record<string, PrepItemYieldMeta>;
}): Record<string, number> {
  const {
    locationPrepItems,
    recipeFiltered,
    prepStockByPrepItemId,
    currentRawStock,
    revenueMultiplier,
    prepYieldByPrepItemId,
  } = params;
  const recipeByPrepId = new Map<string, PrepItemIngredientRow[]>();
  for (const row of recipeFiltered) {
    const list = recipeByPrepId.get(row.prep_item_id) ?? [];
    list.push(row);
    recipeByPrepId.set(row.prep_item_id, list);
  }

  const toMakeByPrepId: Record<string, number> = {};
  for (const row of locationPrepItems) {
    const needed = calcNeededQuantity({
      baseQuantity: row.base_quantity ?? 0,
      revenueMultiplier,
    });
    const finishedPrep = prepStockByPrepItemId[row.prep_item_id] ?? 0;
    const linkedRaws = recipeByPrepId.get(row.prep_item_id) ?? [];
    let convertiblePrepFromRaw = Infinity;
    for (const link of linkedRaws) {
      const factor = yieldFactorForPrepItem(link.prep_item_id, prepYieldByPrepItemId);
      const rawPerPrep = link.quantity_per_unit * factor;
      if (rawPerPrep <= 0) continue;
      const rawStock = currentRawStock[link.raw_ingredient_id] ?? 0;
      convertiblePrepFromRaw = Math.min(convertiblePrepFromRaw, rawStock / rawPerPrep);
    }
    const extraFromRaw = Number.isFinite(convertiblePrepFromRaw) ? convertiblePrepFromRaw : 0;
    toMakeByPrepId[row.prep_item_id] = calcToMake({
      needed,
      currentStock: finishedPrep + extraFromRaw,
      batchSize: row.prep_items?.batch_size ?? null,
    });
  }
  return toMakeByPrepId;
}

/**
 * Cover-window ordering alone can miss partial-batch shortfalls (e.g. falafel coriander).
 */
export function applyPrepBatchIngredientShortfall(params: {
  baseSuggested: Record<string, number>;
  recipeFiltered: PrepItemIngredientRow[];
  locationPrepItems: LocationPrepRowForToMake[];
  prepStockByPrepItemId: Record<string, number>;
  currentRawStock: Record<string, number>;
  revenueMultiplier: number;
  prepYieldByPrepItemId?: Record<string, PrepItemYieldMeta>;
}): Record<string, number> {
  const {
    baseSuggested,
    recipeFiltered,
    locationPrepItems,
    prepStockByPrepItemId,
    currentRawStock,
    revenueMultiplier,
    prepYieldByPrepItemId,
  } = params;
  const toMakeByPrepId = computeToMakeByPrepId({
    locationPrepItems,
    recipeFiltered,
    prepStockByPrepItemId,
    currentRawStock,
    revenueMultiplier,
    prepYieldByPrepItemId,
  });

  const out = { ...baseSuggested };
  for (const row of recipeFiltered) {
    const prepName = locationPrepItems.find((lpi) => lpi.prep_item_id === row.prep_item_id)
      ?.prep_items?.name;
    if (PREP_BATCH_SHORTFALL_EXCLUDED_PREP_NAMES.has(normName(prepName))) continue;
    const toMake = toMakeByPrepId[row.prep_item_id] ?? 0;
    if (toMake <= 0) continue;
    const factor = yieldFactorForPrepItem(row.prep_item_id, prepYieldByPrepItemId);
    const needForBatches = toMake * row.quantity_per_unit * factor;
    const stock = currentRawStock[row.raw_ingredient_id] ?? 0;
    if (stock < needForBatches) {
      out[row.raw_ingredient_id] = Math.max(
        out[row.raw_ingredient_id] ?? 0,
        needForBatches - stock
      );
    }
  }
  return out;
}

const WEST_SUPPRESSED_ORDER_RAW_NAMES = new Set(["rice parboiled"]);

/** Recipe need exists but no supplier API channel — do not warn on ordering page. */
const SUPPLIER_ORDER_EXCLUDED_RAW_NAMES = new Set(["xantana", "shifka peppers"]);

export function isSupplierOrderExcludedRawName(name: string | null | undefined): boolean {
  return SUPPLIER_ORDER_EXCLUDED_RAW_NAMES.has(normRawIngredientName(name));
}

/** West: no parboiled on supplier orders (kitchen buys separately / not on weekly list). */
export function applyWestSuppressedRawOrders(params: {
  locationId?: string | null;
  locationName?: string | null;
  rawIngredients: RawIngredient[];
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  if (!isWestLocation(params.locationName, params.locationId)) return params.baseSuggested;
  const out = { ...params.baseSuggested };
  for (const ing of params.rawIngredients) {
    if (!WEST_SUPPRESSED_ORDER_RAW_NAMES.has(normName(ing.name))) continue;
    delete out[ing.id];
  }
  return out;
}

export function applyProductionGatedRawDailyNeed(params: {
  locationId?: string | null;
  locationName?: string | null;
  dailyRawNeed: Record<string, number>;
  rawIngredients: RawIngredient[];
  recipeFiltered: PrepItemIngredientRow[];
  locationPrepItems: LocationPrepRowForToMake[];
  prepStockByPrepItemId: Record<string, number>;
  currentRawStock: Record<string, number>;
  revenueMultiplier: number;
  prepYieldByPrepItemId?: Record<string, PrepItemYieldMeta>;
}): Record<string, number> {
  const {
    locationId,
    locationName,
    dailyRawNeed,
    rawIngredients,
    recipeFiltered,
    locationPrepItems,
    prepStockByPrepItemId,
    currentRawStock,
    revenueMultiplier,
    prepYieldByPrepItemId,
  } = params;
  const toMakeByPrepId = computeToMakeByPrepId({
    locationPrepItems,
    recipeFiltered,
    prepStockByPrepItemId,
    currentRawStock,
    revenueMultiplier,
    prepYieldByPrepItemId,
  });

  const out = { ...dailyRawNeed };
  for (const ing of rawIngredients) {
    if (
      isWestLocation(locationName, locationId) &&
      WEST_SUPPRESSED_ORDER_RAW_NAMES.has(normName(ing.name))
    ) {
      out[ing.id] = 0;
      continue;
    }
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
  bulgur: 10000,
};

/** When an order line exists, bump to at least this amount (base units). */
export const MIN_ORDER_BASE_BY_RAW_NAME: Record<string, number> = {};

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
    if (mediRawId && (out[mediRawId] ?? 0) > 0) {
      const n = out[mediRawId]!;
      out[mediRawId] = Math.max(MEDI_SALAD_VG_ORDER_PAIR, Math.ceil(n / MEDI_SALAD_VG_ORDER_PAIR) * MEDI_SALAD_VG_ORDER_PAIR);
    }
  }
  return { suggestedPacks: out, kindByRaw: kindOut };
}

/** Zuidas: standing minimum packs (e.g. 2 cauliflower bags) even when prep need is zero. */
export function applyZuidasStandingOrderPacks(params: {
  locationId?: string | null;
  locationName?: string | null;
  rawIngredients: RawIngredient[];
  suggestedPacks: Record<string, number>;
  kindByRaw: Record<string, string>;
}): { suggestedPacks: Record<string, number>; kindByRaw: Record<string, string> } {
  if (!isZuidasLocation(params.locationName, params.locationId)) {
    return { suggestedPacks: params.suggestedPacks, kindByRaw: params.kindByRaw };
  }
  const out = { ...params.suggestedPacks };
  const kindOut = { ...params.kindByRaw };
  for (const [rawName, minPacks] of Object.entries(ZUIDAS_STANDING_ORDER_PACKS_BY_RAW_NAME)) {
    const rid = rawIdByName(params.rawIngredients, rawName);
    if (!rid || minPacks <= 0) continue;
    const cur = out[rid] ?? 0;
    if (cur < minPacks) {
      out[rid] = minPacks;
      kindOut[rid] = rawName === "cauliflower" ? "stocktake" : (kindOut[rid] ?? "pack");
    }
  }
  return { suggestedPacks: out, kindByRaw: kindOut };
}

/** Apply per-ingredient daily-need multipliers (after prep aggregation, before ordering math). */
export function applyDailyNeedMultipliers(params: {
  dailyRawNeed: Record<string, number>;
  rawIngredients: RawIngredient[];
  locationId?: string | null;
  locationName?: string | null;
}): Record<string, number> {
  const out = { ...params.dailyRawNeed };
  const west = isWestLocation(params.locationName, params.locationId);
  const zuidas = isZuidasLocation(params.locationName, params.locationId);
  for (const ing of params.rawIngredients) {
    let mult = DAILY_NEED_MULTIPLIER_BY_RAW_NAME[normName(ing.name)];
    if (west) {
      const westMult = WEST_DAILY_NEED_MULTIPLIER_BY_RAW_NAME[normName(ing.name)];
      if (westMult != null) mult = (mult ?? 1) * westMult;
    }
    if (zuidas) {
      const zuidasMult = ZUIDAS_DAILY_NEED_MULTIPLIER_BY_RAW_NAME[normName(ing.name)];
      if (zuidasMult != null) mult = (mult ?? 1) * zuidasMult;
    }
    if (isDrinkRawName(ing.name)) {
      mult = (mult ?? 1) * SUMMER_DRINK_MULTIPLIER;
    }
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

/** Parsley: minimum 4 kg box; above 4 kg add 1 kg bags for the remainder. */
export function parsleyOrderSplit(baseGrams: number): { box4kg: number; bag1kg: number } {
  if (baseGrams <= 0) return { box4kg: 0, bag1kg: 0 };
  const boxes = Math.floor(baseGrams / PARSLEY_BOX_G);
  if (boxes === 0) return { box4kg: 1, bag1kg: 0 };
  const remainder = baseGrams - boxes * PARSLEY_BOX_G;
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

/** Floor order size when a line is already suggested (see MIN_ORDER_BASE_BY_RAW_NAME). */
export function applyMinOrderBaseFloors(params: {
  rawIngredients: RawIngredient[];
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  const { rawIngredients, baseSuggested } = params;
  const out = { ...baseSuggested };
  for (const ing of rawIngredients) {
    const floor = MIN_ORDER_BASE_BY_RAW_NAME[normName(ing.name)];
    if (floor == null) continue;
    const cur = out[ing.id];
    if (cur != null && cur > 0) out[ing.id] = Math.max(cur, floor);
  }
  return out;
}

const MINT_PREP_NAME = "mint";
const MINT_RAW_BAG_G = 1000;

const BAKING_POWDER_RAW_NAME = "baking powder";
const BAKING_POWDER_ORDER_THRESHOLD_G = 500;
const BAKING_POWDER_CAN_G = 1000;

/** Order one can when stock falls below half a can; skip cover-window bulk orders. */
export function applyBakingPowderOrderGate(params: {
  rawIngredients: RawIngredient[];
  currentRawStock: Record<string, number>;
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  const bakingId = rawIdByName(params.rawIngredients, BAKING_POWDER_RAW_NAME);
  if (!bakingId) return params.baseSuggested;
  const stock = params.currentRawStock[bakingId] ?? 0;
  const out = { ...params.baseSuggested };
  if (stock >= BAKING_POWDER_ORDER_THRESHOLD_G) {
    delete out[bakingId];
    return out;
  }
  out[bakingId] = Math.max(0, BAKING_POWDER_CAN_G - stock);
  return out;
}

/** One VG mint bag (1 kg) when finished mint prep is below today's need. */
export function applyMintBagWhenPrepShort(params: {
  rawIngredients: RawIngredient[];
  locationPrepItems: {
    prep_item_id: string;
    base_quantity?: number | null;
    prep_items?: { name?: string | null } | null;
  }[];
  prepStockByPrepItemId: Record<string, number>;
  currentRawStock: Record<string, number>;
  revenueMultiplier: number;
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  const {
    rawIngredients,
    locationPrepItems,
    prepStockByPrepItemId,
    currentRawStock,
    revenueMultiplier,
    baseSuggested,
  } = params;
  const mintRawId = rawIdByName(rawIngredients, "Mint");
  if (!mintRawId) return baseSuggested;

  const mintRow = locationPrepItems.find(
    (row) => normName(row.prep_items?.name) === MINT_PREP_NAME
  );
  if (!mintRow) return baseSuggested;

  const needed = calcNeededQuantity({
    baseQuantity: mintRow.base_quantity ?? 1,
    revenueMultiplier,
  });
  const prepStock = prepStockByPrepItemId[mintRow.prep_item_id] ?? 0;
  if (needed <= prepStock) return baseSuggested;

  const out = { ...baseSuggested };
  const rawStock = currentRawStock[mintRawId] ?? 0;
  const orderBase = Math.max(0, MINT_RAW_BAG_G - rawStock);
  if (orderBase > 0) {
    out[mintRawId] = Math.max(out[mintRawId] ?? 0, orderBase);
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
