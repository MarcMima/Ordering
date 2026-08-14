import type { PrepItemIngredientRow } from "@/lib/calculations";
import { calcNeededQuantity, calcToMake } from "@/lib/calculations";
import type { IngredientPackSize, RawIngredient, RawIngredientLocationOrdering } from "@/lib/types";
import type { PrepItemYieldMeta } from "@/lib/prepRecipeYield";
import { packSizeToBaseAmount } from "@/lib/stocktakeRawPackMath";

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

const PIJP_LOCATION_IDS = new Set([
  "ffcc1a45-82c3-46ea-97bb-74f94db45c68", // Mima Pijp
]);

export function isPijpLocation(
  locationName: string | null | undefined,
  locationId?: string | null
): boolean {
  if (locationId && PIJP_LOCATION_IDS.has(locationId)) return true;
  return (locationName ?? "").toLowerCase().includes("pijp");
}

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

/** Minimum order packs when the suggestion would otherwise be zero (Pijp). */
const PIJP_STANDING_ORDER_PACKS_BY_RAW_NAME: Record<string, number> = {
  cauliflower: 2,
};

/** Pijp tweaks on top of cover-window math (Van Gelder = 1-day cover). */
const PIJP_DAILY_NEED_MULTIPLIER_BY_RAW_NAME: Record<string, number> = {
  cauliflower: 2,
  "medi salad 3kg": 1.3,
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
  return (name ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function rawIdByName(rawIngredients: RawIngredient[], name: string): string | null {
  const want = normName(name);
  return rawIngredients.find((r) => normName(r.name) === want)?.id ?? null;
}

/** Scale daily raw need before cover-window / pack math (kitchen calibration Jun 2026). */
export const DAILY_NEED_MULTIPLIER_BY_RAW_NAME: Record<string, number> = {
  "romaine lettuce": 0.5,
  aubergine: 1.014,
  "red cabbage shredded": 0.6,
  chickpeas: 0.85,
  "coriander (fresh)": 0.85,
  "pomegranate seeds": 0.85,
  "onion peeled": 0.85,
  "feta cheese": 0.85,
  "greek yoghurt 10%": 0.85,
  yoghurt: 0.85,
  "greek yogurt 10%": 0.85,
};

/** Summer drink uplift — disabled; stock pars and cover window are enough. */
const SUMMER_DRINK_MULTIPLIER = 1;

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
/** Reorder peeled garlic only when stock falls below 0.5 kg. */
const GARLIC_PEELED_ORDER_THRESHOLD_G = 500;

/** Only suggest orders when linked prep still needs production (toMake > 0). */
export const PRODUCTION_GATED_RAW_NAMES = new Set([
  "green chili",
  "rice parboiled",
  "coriander (fresh)",
]);

/**
 * Raw stock must be prepped before it counts as finished prep (e.g. raw aubergine ≠ Sabich).
 * Excluded from convertible-prep credit in {@link computeToMakeByPrepId}.
 */
const RAW_NO_PREP_CONVERSION_CREDIT_NAMES = new Set<string>();

/** Recipe-book "Coriander" in falafel/srug = fresh herb (Van Gelder), not ground spice. */
const RAW_INGREDIENT_NAME_ALIASES: Record<string, string> = {
  coriander: "coriander (fresh)",
};

export function normRawIngredientName(name: string | null | undefined): string {
  const n = (name ?? "").toLowerCase().trim().replace(/\s+/g, " ");
  return RAW_INGREDIENT_NAME_ALIASES[n] ?? n;
}

/** Prep bought ready-made (not produced from raw in-house) — cover-window math is enough. */
const PREP_BATCH_SHORTFALL_EXCLUDED_PREP_NAMES = new Set([
  "marinated chicken",
  "grilled chicken",
  "pickled onion",
  "pickled cabbage",
]);

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
  rawNameByRawId?: Record<string, string>;
  /** When true, only finished prep stock counts (matches prep list). */
  finishedPrepOnly?: boolean;
}): Record<string, number> {
  const {
    locationPrepItems,
    recipeFiltered,
    prepStockByPrepItemId,
    currentRawStock,
    revenueMultiplier,
    prepYieldByPrepItemId,
    rawNameByRawId,
    finishedPrepOnly = false,
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
    if (!finishedPrepOnly) {
      for (const link of linkedRaws) {
        const rawName = rawNameByRawId?.[link.raw_ingredient_id];
        if (rawName && RAW_NO_PREP_CONVERSION_CREDIT_NAMES.has(normName(rawName))) continue;
        const factor = yieldFactorForPrepItem(link.prep_item_id, prepYieldByPrepItemId);
        const rawPerPrep = link.quantity_per_unit * factor;
        if (rawPerPrep <= 0) continue;
        const rawStock = currentRawStock[link.raw_ingredient_id] ?? 0;
        convertiblePrepFromRaw = Math.min(convertiblePrepFromRaw, rawStock / rawPerPrep);
      }
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
  prepStockCreditByRawId?: Record<string, number>;
  revenueMultiplier: number;
  prepYieldByPrepItemId?: Record<string, PrepItemYieldMeta>;
  rawNameByRawId?: Record<string, string>;
}): Record<string, number> {
  const {
    baseSuggested,
    recipeFiltered,
    locationPrepItems,
    prepStockByPrepItemId,
    currentRawStock,
    prepStockCreditByRawId,
    revenueMultiplier,
    prepYieldByPrepItemId,
    rawNameByRawId,
  } = params;
  const toMakeByPrepId = computeToMakeByPrepId({
    locationPrepItems,
    recipeFiltered,
    prepStockByPrepItemId,
    currentRawStock,
    revenueMultiplier,
    prepYieldByPrepItemId,
    rawNameByRawId,
    finishedPrepOnly: true,
  });

  const out = { ...baseSuggested };
  for (const row of recipeFiltered) {
    const prepName = locationPrepItems.find((lpi) => lpi.prep_item_id === row.prep_item_id)
      ?.prep_items?.name;
    if (PREP_BATCH_SHORTFALL_EXCLUDED_PREP_NAMES.has(normName(prepName))) continue;
    const rawName = normName(rawNameByRawId?.[row.raw_ingredient_id]);
    if (PRODUCTION_GATED_RAW_NAMES.has(rawName)) continue;
    if (normName(prepName) === "falafel" && rawName === "chickpeas") continue;
    if (normName(prepName) === "hummus" && rawName === "chickpeas") continue;
    // Parsley: cover-window already includes Falafel/Medi/Turmeric daily rate.
    if (rawName === PARSLEY_RAW_NAME && normName(prepName) !== PARSLEY_RAW_NAME) continue;
    const toMake = toMakeByPrepId[row.prep_item_id] ?? 0;
    if (toMake <= 0) continue;
    const factor = yieldFactorForPrepItem(row.prep_item_id, prepYieldByPrepItemId);
    const needForBatches = toMake * row.quantity_per_unit * factor;
    const stock =
      (currentRawStock[row.raw_ingredient_id] ?? 0) +
      (prepStockCreditByRawId?.[row.raw_ingredient_id] ?? 0);
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

/** Drop lines for raws that are not orderable via any supplier channel. */
export function applySupplierExcludedRawSuppress(params: {
  rawIngredients: RawIngredient[];
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  const out = { ...params.baseSuggested };
  for (const ing of params.rawIngredients) {
    if (!isSupplierOrderExcludedRawName(ing.name)) continue;
    delete out[ing.id];
  }
  return out;
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
    rawNameByRawId: Object.fromEntries(rawIngredients.map((r) => [r.id, r.name ?? ""])),
    finishedPrepOnly: false,
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

/** Only suggest an order when unrounded pack count reaches this value (1 crate = 8 heads). */
export const MIN_ORDER_PACKS_BY_RAW_NAME: Record<string, number> = {
  "romaine lettuce": 1,
};

export function passesMinOrderPackThreshold(
  rawName: string | null | undefined,
  packCount: number,
  dbMinPacks?: number | null
): boolean {
  // Prefer DB column; fall back to hardcoded map.
  const min = dbMinPacks != null ? dbMinPacks : MIN_ORDER_PACKS_BY_RAW_NAME[normName(rawName)];
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

/** Zuidas / Pijp: standing minimum packs (e.g. 2 cauliflower boxes) even when prep need is zero. */
export function applyZuidasStandingOrderPacks(params: {
  locationId?: string | null;
  locationName?: string | null;
  rawIngredients: RawIngredient[];
  suggestedPacks: Record<string, number>;
  kindByRaw: Record<string, string>;
  /** Per-location overrides from raw_ingredient_location_ordering. */
  locationOrderingByRawId?: Record<string, RawIngredientLocationOrdering>;
}): { suggestedPacks: Record<string, number>; kindByRaw: Record<string, string> } {
  const out = { ...params.suggestedPacks };
  const kindOut = { ...params.kindByRaw };
  const isZuidas = isZuidasLocation(params.locationName, params.locationId);
  const isPijp = isPijpLocation(params.locationName, params.locationId);

  if (params.locationOrderingByRawId && Object.keys(params.locationOrderingByRawId).length > 0) {
    // DB path: use standing_order_packs from location ordering overrides.
    for (const ing of params.rawIngredients) {
      const locOverride = params.locationOrderingByRawId[ing.id];
      const minPacks = locOverride?.standing_order_packs;
      if (minPacks == null || minPacks <= 0) continue;
      const cur = out[ing.id] ?? 0;
      if (cur < minPacks) {
        out[ing.id] = minPacks;
        kindOut[ing.id] = normName(ing.name) === "aubergine" ? "stocktake" : (kindOut[ing.id] ?? "pack");
      }
    }
    return { suggestedPacks: out, kindByRaw: kindOut };
  }

  // Hardcoded fallback.
  const standingByRawName = isZuidas
    ? ZUIDAS_STANDING_ORDER_PACKS_BY_RAW_NAME
    : isPijp
      ? PIJP_STANDING_ORDER_PACKS_BY_RAW_NAME
      : null;
  if (!standingByRawName) {
    return { suggestedPacks: out, kindByRaw: kindOut };
  }
  for (const [rawName, minPacks] of Object.entries(standingByRawName)) {
    const rid = rawIdByName(params.rawIngredients, rawName);
    if (!rid || minPacks <= 0) continue;
    const cur = out[rid] ?? 0;
    if (cur < minPacks) {
      out[rid] = minPacks;
      kindOut[rid] = rawName === "aubergine" ? "stocktake" : (kindOut[rid] ?? "pack");
    }
  }
  return { suggestedPacks: out, kindByRaw: kindOut };
}

/** Log override keys that don't match any ingredient at this location (stale/mistyped entries). */
function logUnmatchedOverrideKeys(
  overrideMap: Record<string, unknown>,
  ingredientNames: Set<string>,
  label: string
) {
  for (const key of Object.keys(overrideMap)) {
    if (!ingredientNames.has(key)) {
      console.warn(`[ordering] override "${label}" key "${key}" matches no ingredient`);
    }
  }
}

/** Apply per-ingredient daily-need multipliers (after prep aggregation, before ordering math). */
export function applyDailyNeedMultipliers(params: {
  dailyRawNeed: Record<string, number>;
  rawIngredients: RawIngredient[];
  locationId?: string | null;
  locationName?: string | null;
  /** Per-location overrides loaded from raw_ingredient_location_ordering. */
  locationOrderingByRawId?: Record<string, RawIngredientLocationOrdering>;
}): Record<string, number> {
  const out = { ...params.dailyRawNeed };
  const allNormedNames = new Set(params.rawIngredients.map((r) => normName(r.name)));
  logUnmatchedOverrideKeys(DAILY_NEED_MULTIPLIER_BY_RAW_NAME, allNormedNames, "DAILY_NEED_MULTIPLIER");
  const west = isWestLocation(params.locationName, params.locationId);
  const zuidas = isZuidasLocation(params.locationName, params.locationId);
  const pijp = isPijpLocation(params.locationName, params.locationId);
  for (const ing of params.rawIngredients) {
    // Prefer DB column; fall back to hardcoded global multiplier.
    let mult: number | null | undefined =
      ing.ordering_daily_need_multiplier != null
        ? ing.ordering_daily_need_multiplier
        : DAILY_NEED_MULTIPLIER_BY_RAW_NAME[normName(ing.name)];

    // Location-specific multiplier: DB override takes precedence over hardcoded location maps.
    const locOverride = params.locationOrderingByRawId?.[ing.id];
    if (locOverride?.daily_need_multiplier != null) {
      mult = (mult ?? 1) * locOverride.daily_need_multiplier;
    } else {
      if (west) {
        const westMult = WEST_DAILY_NEED_MULTIPLIER_BY_RAW_NAME[normName(ing.name)];
        if (westMult != null) mult = (mult ?? 1) * westMult;
      }
      if (zuidas) {
        const zuidasMult = ZUIDAS_DAILY_NEED_MULTIPLIER_BY_RAW_NAME[normName(ing.name)];
        if (zuidasMult != null) mult = (mult ?? 1) * zuidasMult;
      }
      if (pijp) {
        const pijpMult = PIJP_DAILY_NEED_MULTIPLIER_BY_RAW_NAME[normName(ing.name)];
        if (pijpMult != null) mult = (mult ?? 1) * pijpMult;
      }
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

/** Garlic peeled: only suggest when stock is below 0.5 kg. */
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

const AUBERGINE_SABICH_PREP_NAME = "aubergine / sabich";
const AUBERGINE_RAW_NAME = "aubergine";
/** Keep at least this many finished Sabich GN containers before ordering fresh aubergine. */
const AUBERGINE_SABICH_MIN_CONTAINERS = 3;
/** Fresh aubergine grams per Sabich container (prep_item_ingredients). */
const AUBERGINE_G_PER_SABICH_CONTAINER = 2600;

/**
 * Fresh VG aubergine for Sabich only: finished Sabich containers suppress/order.
 * (Baba ganoush uses Bidfood aubergine puree — separate pipeline.)
 */
export function applyAubergineSabichMinContainers(params: {
  rawIngredients: RawIngredient[];
  locationPrepItems: {
    prep_item_id: string;
    prep_items?: { name?: string | null } | null;
  }[];
  prepStockByPrepItemId: Record<string, number>;
  currentRawStock: Record<string, number>;
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  const aubergineId = rawIdByName(params.rawIngredients, AUBERGINE_RAW_NAME);
  if (!aubergineId) return params.baseSuggested;

  const sabichRow = params.locationPrepItems.find(
    (row) => normName(row.prep_items?.name) === AUBERGINE_SABICH_PREP_NAME
  );
  if (!sabichRow) return params.baseSuggested;

  const prepStock = params.prepStockByPrepItemId[sabichRow.prep_item_id] ?? 0;
  const out = { ...params.baseSuggested };

  if (prepStock >= AUBERGINE_SABICH_MIN_CONTAINERS) {
    delete out[aubergineId];
    return out;
  }

  const rawStock = params.currentRawStock[aubergineId] ?? 0;
  const shortfallG =
    (AUBERGINE_SABICH_MIN_CONTAINERS - prepStock) * AUBERGINE_G_PER_SABICH_CONTAINER - rawStock;
  if (shortfallG > 0) {
    out[aubergineId] = Math.max(out[aubergineId] ?? 0, shortfallG);
  } else {
    delete out[aubergineId];
  }
  return out;
}

/** Parsley: 4 kg box when need ≤ 4 kg; above that, boxes + 1 kg bags for the remainder. */
export function parsleyOrderSplit(baseGrams: number): { box4kg: number; bag1kg: number } {
  if (baseGrams <= 0) return { box4kg: 0, bag1kg: 0 };
  if (baseGrams <= PARSLEY_BOX_G) return { box4kg: 1, bag1kg: 0 };
  const boxes = Math.floor(baseGrams / PARSLEY_BOX_G);
  const remainder = baseGrams - boxes * PARSLEY_BOX_G;
  const bag1kg = remainder > 0 ? Math.ceil(remainder / PARSLEY_ADDON_G) : 0;
  return { box4kg: boxes, bag1kg };
}

/** UI / order lines: one row per pack size (merge duplicate 1 kg bag lines). */
export function parsleyOrderLines(baseGrams: number): { packSizeKg: 4 | 1; quantity: number }[] {
  const split = parsleyOrderSplit(baseGrams);
  const lines: { packSizeKg: 4 | 1; quantity: number }[] = [];
  if (split.box4kg > 0) lines.push({ packSizeKg: 4, quantity: split.box4kg });
  if (split.bag1kg > 0) lines.push({ packSizeKg: 1, quantity: split.bag1kg });
  return lines;
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
    // Prefer DB column; fall back to hardcoded map.
    const cap = ing.ordering_max_order_base != null
      ? ing.ordering_max_order_base
      : MAX_ORDER_BASE_BY_RAW_NAME[normName(ing.name)];
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
    // Prefer DB column; fall back to hardcoded map.
    const floor = ing.ordering_min_order_base != null
      ? ing.ordering_min_order_base
      : MIN_ORDER_BASE_BY_RAW_NAME[normName(ing.name)];
    if (floor == null) continue;
    const cur = out[ing.id];
    if (cur != null && cur > 0) out[ing.id] = Math.max(cur, floor);
  }
  return out;
}

const MINT_PREP_NAME = "mint";
/** Raw mint per finished Mint GN 1/6 (prep_item_ingredients): a full 1/6 GN holds 40 g. */
const MINT_RAW_G_PER_PREP_UNIT = 40;

const BAKING_POWDER_RAW_NAME = "baking powder";
const BAKING_POWDER_ORDER_THRESHOLD_G = 500;
const BAKING_POWDER_CAN_G = 1000;

const LEMON_JUICE_RAW_NAME = "lemon juice";
/** 1 case = 12 × 1 L bottles (raw unit is ml). */
const LEMON_JUICE_CASE_ML = 12000;

const FLOUR_RAW_NAME = "all purpose flour";
/** Reorder point: only order (one 10 kg case) when counted stock dips below 2 kg. */
const FLOUR_REORDER_BELOW_G = 2000;

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

/** Flour is a pure reorder-point item: no line at all until stock < 2 kg, then one case. */
export function applyFlourOrderGate(params: {
  rawIngredients: RawIngredient[];
  currentRawStock: Record<string, number>;
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  const flourId = rawIdByName(params.rawIngredients, FLOUR_RAW_NAME);
  if (!flourId) return params.baseSuggested;
  const stock = params.currentRawStock[flourId] ?? 0;
  const out = { ...params.baseSuggested };
  if (stock >= FLOUR_REORDER_BELOW_G) {
    delete out[flourId];
    return out;
  }
  // Below the reorder point: order the shortfall; pack rounding turns this into one 10 kg case.
  out[flourId] = Math.max(out[flourId] ?? 0, FLOUR_REORDER_BELOW_G - stock);
  return out;
}

/** Skip bulk cover-window orders when stock is at or above one case (12 L). */
export function applyLemonJuiceOrderGate(params: {
  rawIngredients: RawIngredient[];
  currentRawStock: Record<string, number>;
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  const lemonId = rawIdByName(params.rawIngredients, LEMON_JUICE_RAW_NAME);
  if (!lemonId) return params.baseSuggested;
  const stock = params.currentRawStock[lemonId] ?? 0;
  const out = { ...params.baseSuggested };
  if (stock >= LEMON_JUICE_CASE_ML) {
    delete out[lemonId];
    return out;
  }
  const shortfall = Math.max(0, LEMON_JUICE_CASE_ML - stock);
  if (out[lemonId] != null) {
    out[lemonId] = Math.min(out[lemonId], shortfall);
  } else if (shortfall > 0) {
    out[lemonId] = shortfall;
  }
  return out;
}

/**
 * Mint: order VG bundles only for true shortfall after finished prep + raw stock.
 * (Avoids forcing a 1 kg line when prep is low but raw mint already covers today.)
 */
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
  orderPackByRawId?: Record<string, IngredientPackSize | null>;
}): Record<string, number> {
  const {
    rawIngredients,
    locationPrepItems,
    prepStockByPrepItemId,
    currentRawStock,
    revenueMultiplier,
    baseSuggested,
    orderPackByRawId,
  } = params;
  const mintRawId = rawIdByName(rawIngredients, "Mint");
  if (!mintRawId) return baseSuggested;

  const mintRow = locationPrepItems.find(
    (row) => normName(row.prep_items?.name) === MINT_PREP_NAME
  );
  if (!mintRow) return baseSuggested;

  const neededPrep = calcNeededQuantity({
    baseQuantity: mintRow.base_quantity ?? 1,
    revenueMultiplier,
  });
  const prepStock = prepStockByPrepItemId[mintRow.prep_item_id] ?? 0;
  const needG = neededPrep * MINT_RAW_G_PER_PREP_UNIT;
  const haveG = prepStock * MINT_RAW_G_PER_PREP_UNIT + (currentRawStock[mintRawId] ?? 0);
  if (needG <= haveG) {
    const out = { ...baseSuggested };
    delete out[mintRawId];
    return out;
  }

  const shortfallG = needG - haveG;
  const mintIng = rawIngredients.find((r) => r.id === mintRawId);
  const pack = orderPackByRawId?.[mintRawId];
  let orderG = shortfallG;
  if (pack && mintIng) {
    const perBundle = packSizeToBaseAmount(pack, mintIng.unit ?? "g");
    if (perBundle != null && perBundle > 0) {
      orderG = Math.ceil(shortfallG / perBundle) * perBundle;
    }
  }

  const out = { ...baseSuggested };
  if (orderG > 0) out[mintRawId] = Math.max(out[mintRawId] ?? 0, orderG);
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
    if (!passesMinOrderPackThreshold(ing.name, out[ing.id] ?? 0, ing.ordering_min_order_packs)) {
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
  currentRawStock?: Record<string, number>;
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
    const stock = params.currentRawStock?.[ing.id] ?? 0;
    if (stock >= bps) continue;
    out[ing.id] = bps / Math.floor(interval);
  }
  return out;
}
