import type { SupabaseClient } from "@supabase/supabase-js";
import type { Supplier, RawIngredient, IngredientPackSize, PrepItem, RawIngredientLocationOrdering } from "@/lib/types";
import { buildYieldMetaForPrepItem, type PrepItemYieldMeta } from "@/lib/prepRecipeYield";
import {
  supplierScheduleDayToJsDay,
  aggregateDailyRawNeedFromPrep,
  calcNeededQuantity,
  dedupePrepItemIngredientRows,
  suggestOrderBaseQuantities,
  baseAmountsToPackCounts,
  getBestPackSize,
  getOrderPackDeterministic,
  applyOrderPackMultipleRounding,
  getRevenueMultiplier,
  coverWindowCalendarDates,
  orderCoverWindowForRaw,
  orderIntervalPlanningDays,
  type PrepItemIngredientRow,
} from "@/lib/calculations";
import { localCalendarDateString } from "@/lib/date";
import { ensureEffectiveDailyRevenueTargetCents } from "@/lib/revenueTarget";
import {
  applyDailyNeedMultipliers,
  applyGarlicPeeledOrderGate,
  applyAubergineSabichMinContainers,
  applyBakingPowderOrderGate,
  applyFlourOrderGate,
  applyLemonJuiceOrderGate,
  applyMaxOrderBaseCaps,
  applyMinOrderBaseFloors,
  applyMintBagWhenPrepShort,
  applyMediSaladBaseSuggestedCleanup,
  applyMediSaladSuggestedPacksCleanup,
  applyMediSaladVanGelderOverride,
  applyMinOrderPackThresholds,
  applyProductionGatedBaseSuggested,
  applyProductionGatedRawDailyNeed,
  applySupplierExcludedRawSuppress,
  applyWestSuppressedRawOrders,
  applyPrepBatchIngredientShortfall,
  applyZuidasStandingOrderPacks,
  PRODUCTION_GATED_RAW_NAMES,
  isParsleyRawName,
  mergeWeeklyIntervalDailyNeed,
  isSupplierOrderExcludedRawName,
  normRawIngredientName,
  parsleyOrderSplit,
  passesMinOrderPackThreshold,
} from "@/lib/orderingAdjustments";
import { applyStockParToBaseSuggested } from "@/lib/stockPar";
import {
  applyDrinkTrayParToBaseSuggested,
  applyDrinkTrayStandingPacks,
} from "@/lib/drinkTrayPar";
import { isPicklingRawName, PICKLING_LEAD_TIME_DAYS } from "@/lib/picklingLeadTime";
import { computeRawCoveredByFinishedPrep, computePickledPrepRawCredit } from "@/lib/prepStockRawCredit";
import { computeDefrostedFlatbreadRawCredit } from "@/lib/flatbreadPrepStock";
import {
  applyCombinedPitaStockCredit,
  extractPitaStockCounts,
} from "@/lib/pitaPrepStock";
import {  isWeeklyPlannedRaw } from "@/lib/stocktakeWeek";
import { isWeeklyStocktakeDueOnDate, buildOrderingStockByRawId } from "@/lib/stocktakeWeek";
import {
  isPrepVisibleOnStocktake,
  isRawVisibleOnStocktakeForLocation,
} from "@/lib/stocktakeVisibility";
import {
  basePerOneStocktakeInputUnit,
} from "@/lib/stocktakeRawPackMath";


export type DeliverySchedule = {
  supplier_id: string;
  day_of_week: number;
};

/** Genormaliseerde grondstofnaam voor naamvergelijkingen. */
export function normIngredientName(name: string | null | undefined): string {
  return normRawIngredientName(name);
}

/** Hoe de gesuggereerde hoeveelheid tot stand kwam: via een orderpack, de stocktake-eenheid of ruwe recepteenheden. */
export type SuggestionOrderKind = "pack" | "stocktake" | "recipe";

/**
 * Eén regel van het vastgelegde suggestie-snapshot: wat de app adviseerde voor een
 * grondstof op een dag, en de invoer waarop dat advies rustte.
 */
export type OrderSuggestionSnapshotLine = {
  raw_ingredient_id: string;
  name: string;
  supplier_id: string | null;
  /** Geadviseerde hoeveelheid in base units (dezelfde eenheid als recepten en voorraad). */
  suggested_base_qty: number;
  /** Geadviseerde hoeveelheid in besteleenheden, na colli-/MOQ-afronding. */
  suggested_packs: number;
  /** Collistap waarop het aantal packs is afgerond (1 = geen afronding). */
  pack_multiple: number;
  /** Aantal dagen behoefte dat de suggestie overbrugt, inclusief inmaakdagen. */
  days_cover: number;
  /** Voorraad uit de telling waartegen de suggestie is gerekend. */
  stock_at_count: number;
  /** Basisbehoefte per dag op vol vermogen, in base units. */
  daily_need: number;
};

export type OrderSuggestionInsight = {
  dateUsed: string;
  prepLinkedCount: number;
  recipeRowsForLocation: number;
  dailyRawNeedSum: number;
  baseOrderNeedSum: number;
  suggestionLineCount: number;
  packRowsLoadedFromDb: number;
  packFetchError: string | null;
  locationRawCount: number;
  stockRowsForDate: number;
  revenueCoverDates: string[];
  revenueEveningDate: string;
  packConversionLineCount: number;
  baseFallbackLineCount: number;
  unmatchedRecipeNames: string[];
};

export type OrderSuggestionOutcome =
  | { ok: false; message: string }
  | {
      ok: true;
      prepStocktakeComplete: boolean;
      currentRawStockById: Record<string, number>;
      currentPrepStockById: Record<string, number>;
      revenueTargetCents: number | null;
      supplierRawIdsBySupplier: Record<string, string[]>;
      snapshotLines: OrderSuggestionSnapshotLine[];
      supplementalPackSizes: IngredientPackSize[];
      mediSaladNeedPrep: number;
      baseSuggestedByRaw: Record<string, number>;
      suggestedOrder: Record<string, number>;
      suggestionOrderKindByRaw: Record<string, SuggestionOrderKind>;
      suggestionSupplierByRaw: Record<string, string | null>;
      suggestedUnassignedRawIds: string[];
      stockRowsForDateCount: number;
      suggestionLineCount: number;
      insight: OrderSuggestionInsight;
    };

/** DB/JSON geeft size soms als string terug; normaliseren voor vergelijkingen. */
export function normalizePackRow(p: IngredientPackSize): IngredientPackSize {
  const s = Number(p.size);
  const m = Number(p.order_pack_multiple);
  const mult = Number.isFinite(m) && m >= 1 ? Math.floor(m) : 1;
  return {
    ...p,
    size: Number.isFinite(s) && s > 0 ? s : 0,
    order_pack_multiple: mult,
  };
}

/** Orderpacks uit het masterblad hebben voorrang; val terug als er alleen stocktake-packs zijn. */
export function packsForOrder(packs: IngredientPackSize[]): IngredientPackSize[] {
  const o = packs.filter((p) => {
    const pr = (p.pack_purpose || "both").toLowerCase();
    return pr === "order" || pr === "both";
  });
  return o.length > 0 ? o : packs;
}

export function normSupplierName(name: string): string {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const RAW_INGREDIENTS_WITH_PACKS_SELECT = `id, name, unit, location_id, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit, order_pack_multiple, ordering_daily_need_multiplier, ordering_min_order_packs, ordering_max_order_base, ordering_min_order_base, stock_par_kind, stock_par_min_amount, stock_par_min_packs, stock_par_order_packs, ingredient_pack_sizes ( id, raw_ingredient_id, size, size_unit, price_cents, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple )`;

type RawWithNestedPacks = RawIngredient & {
  ingredient_pack_sizes?: IngredientPackSize[] | IngredientPackSize | null;
};

export async function loadRawIngredientsWithPacks(
  supabase: SupabaseClient,
  locationId: string
): Promise<{ rawList: RawIngredient[]; packList: IngredientPackSize[] }> {
  const rRes = await supabase
    .from("raw_ingredients")
    .select(RAW_INGREDIENTS_WITH_PACKS_SELECT)
    .eq("location_id", locationId)
    .order("name");
  if (rRes.error) throw rRes.error;

  const rawRows = (rRes.data as RawWithNestedPacks[]) ?? [];
  const rawList: RawIngredient[] = [];
  const packList: IngredientPackSize[] = [];
  for (const row of rawRows) {
    const { ingredient_pack_sizes: nested, ...ing } = row;
    rawList.push(ing);
    const list = Array.isArray(nested) ? nested : nested != null ? [nested] : [];
    for (const p of list) packList.push(p);
  }

  const dedupe = new Map<string, IngredientPackSize>();
  for (const p of packList) {
    dedupe.set(p.id, normalizePackRow(p));
  }
  const rawIds = rawList.map((r) => r.id);
  const packChunk = 100;
  for (let i = 0; i < rawIds.length; i += packChunk) {
    const chunk = rawIds.slice(i, i + packChunk);
    const pr = await supabase
      .from("ingredient_pack_sizes")
      .select(
        "id, raw_ingredient_id, size, size_unit, price_cents, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple"
      )
      .in("raw_ingredient_id", chunk);
    if (pr.error) throw pr.error;
    const rows = ((pr.data as IngredientPackSize[]) ?? []).map(normalizePackRow);
    for (const p of rows) {
      if (!dedupe.has(p.id)) dedupe.set(p.id, p);
    }
  }

  return { rawList, packList: Array.from(dedupe.values()) };
}

/**
 * Alle configuratie die computeOrderSuggestion nodig heeft naast de datum: leveranciers,
 * leverschema's, grondstoffen met packs en de per-locatie ordering-overrides. Dit is wat
 * de bestelpagina bij het laden in state zet — de History-pagina heeft het los nodig om
 * een dag uit het verleden door de huidige parameters te halen.
 */
export async function loadOrderSuggestionConfig(
  supabase: SupabaseClient,
  locationId: string
): Promise<{
  suppliers: Supplier[];
  schedules: DeliverySchedule[];
  rawIngredients: RawIngredient[];
  packSizes: IngredientPackSize[];
  locationOrderingByRawId: Record<string, RawIngredientLocationOrdering>;
}> {
  const [supRes, schRes, rawPacks, loRes] = await Promise.all([
    supabase.from("suppliers").select("id, name, location_id").eq("location_id", locationId).order("name"),
    supabase
      .from("supplier_delivery_schedules")
      .select("supplier_id, day_of_week")
      .eq("location_id", locationId),
    loadRawIngredientsWithPacks(supabase, locationId),
    supabase
      .from("raw_ingredient_location_ordering")
      .select("id, raw_ingredient_id, location_id, daily_need_multiplier, standing_order_packs")
      .eq("location_id", locationId),
  ]);
  if (supRes.error) throw supRes.error;
  if (schRes.error) throw schRes.error;
  if (loRes.error) throw loRes.error;

  const locationOrderingByRawId: Record<string, RawIngredientLocationOrdering> = {};
  for (const row of (loRes.data as RawIngredientLocationOrdering[]) ?? []) {
    locationOrderingByRawId[row.raw_ingredient_id] = row;
  }

  return {
    suppliers: (supRes.data as Supplier[]) ?? [],
    schedules: (schRes.data as DeliverySchedule[]) ?? [],
    rawIngredients: rawPacks.rawList,
    packSizes: rawPacks.packList,
    locationOrderingByRawId,
  };
}

/**
 * De volledige bestelsuggestie voor één locatie op één dag.
 *
 * Dit is de rekenkern die eerder in een effect op de bestelpagina stond. Hij is
 * geparametriseerd op `date`, zodat dezelfde pijplijn ook een dag uit het verleden kan
 * doorrekenen met de configuratie van nu — dat is precies wat de History-kolom
 * "With current settings" laat zien.
 *
 * Strikt lezend op één uitzondering na: ensureEffectiveDailyRevenueTargetCents schrijft
 * een carry-forward weg, maar bewaakt zelf dat dat nooit voor een datum in het verleden
 * gebeurt. Verplaats die aanroep niet zonder die guard te controleren.
 */
export async function computeOrderSuggestion(params: {
  supabase: SupabaseClient;
  locationId: string;
  /** Kalenderdag waarvoor gerekend wordt (YYYY-MM-DD). */
  date: string;
  rawIngredients: RawIngredient[];
  schedules: DeliverySchedule[];
  packSizes: IngredientPackSize[];
  suppliers: Supplier[];
  locationOrderingByRawId: Record<string, RawIngredientLocationOrdering>;
}): Promise<OrderSuggestionOutcome> {
  const {
    supabase,
    locationId,
    date,
    rawIngredients,
    schedules,
    packSizes,
    suppliers,
    locationOrderingByRawId,
  } = params;
const d = date;
const rawsForRequest = rawIngredients.filter((r) =>
  isRawVisibleOnStocktakeForLocation(r, locationId)
);
const rawIds = new Set(rawsForRequest.map((r) => r.id));
const rawIdList = Array.from(rawIds);
const todayForCover = new Date(`${d}T12:00:00`);
const [stockWindowY, stockWindowM, stockWindowD] = d.split("-").map(Number);
const stockWindowStartDate = new Date(stockWindowY, stockWindowM - 1, stockWindowD);
stockWindowStartDate.setDate(stockWindowStartDate.getDate() - 7);
const stockWindowStart = localCalendarDateString(stockWindowStartDate);

  const lpiRes = await supabase
    .from("location_prep_items")
    .select(
      "prep_item_id, base_quantity, prep_items(id, name, content_amount, content_unit, recipe_output_amount, recipe_output_unit, ingredient_qty_is_per_recipe_batch, stocktake_visible, batch_size)"
    )
    .eq("location_id", locationId);
  if (lpiRes.error) {
    return { ok: false, message: String(lpiRes.error.message) };
  }
  const lpiAll =
    (lpiRes.data as unknown as {
      prep_item_id: string;
      base_quantity?: number | null;
      prep_items: PrepItem | null;
    }[]) ?? [];
  const lpi = lpiAll.filter((row) => isPrepVisibleOnStocktake(row.prep_items));
  const prepYieldByPrepItemId: Record<string, PrepItemYieldMeta> = {};
  for (const row of lpi) {
    const p = row.prep_items;
    if (p?.id) prepYieldByPrepItemId[p.id] = buildYieldMetaForPrepItem(p);
  }
  const mediSaladPrepItemIdFromAll =
    lpiAll.find((row) =>
      (row.prep_items?.name ?? "").toLowerCase().includes("medi salad")
    )?.prep_item_id ?? null;
  const prepIdsAtLocation = [
    ...new Set([
      ...lpi.map((row) => row.prep_item_id),
      ...(mediSaladPrepItemIdFromAll ? [mediSaladPrepItemIdFromAll] : []),
    ]),
  ];

  const [revCents, locRes, recipeRes, stockRes, supRes, siRes, prepCountRes, prepQtyRes] = await Promise.all([
    ensureEffectiveDailyRevenueTargetCents(supabase, locationId, d),
    supabase
      .from("locations")
      .select("name, full_capacity_revenue, ordering_evening_day_fraction, weekly_stocktake_day_of_week")
      .eq("id", locationId)
      .single(),
    prepIdsAtLocation.length === 0
      ? Promise.resolve({ data: [] as PrepItemIngredientRow[], error: null })
      : supabase
          .from("prep_item_ingredients")
          .select("prep_item_id, raw_ingredient_id, quantity_per_unit")
          .in("prep_item_id", prepIdsAtLocation)
          .limit(10000),
    supabase
      .from("daily_stock_counts")
      .select("raw_ingredient_id, quantity, date")
      .eq("location_id", locationId)
      .gte("date", stockWindowStart)
      .lte("date", d),
    supabase.from("suppliers").select("id, name").eq("location_id", locationId),
    supabase
      .from("supplier_ingredients")
      .select("supplier_id, raw_ingredient_id, is_preferred")
      .in("raw_ingredient_id", rawIdList)
      .limit(10000),
    supabase
      .from("daily_prep_counts")
      .select("id", { count: "exact", head: true })
      .eq("location_id", locationId)
      .eq("date", d),
    supabase
      .from("daily_prep_counts")
      .select("prep_item_id, quantity")
      .eq("location_id", locationId)
      .eq("date", d),
  ]);

  const countedPrepForDate =
    prepCountRes.error != null ? 0 : (prepCountRes.count ?? 0);
  const prepComplete = lpi.length > 0 && countedPrepForDate >= lpi.length;

  const err =
    locRes.error ||
    recipeRes.error ||
    stockRes.error ||
    supRes.error ||
    siRes.error ||
    prepQtyRes.error;
  if (err) {
    return {
      ok: false,
      message:
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Could not load order suggestion.",
    };
  }

  const loc = locRes.data as {
    name?: string | null;
    full_capacity_revenue?: number | null;
    ordering_evening_day_fraction?: number | null;
    weekly_stocktake_day_of_week?: number | null;
  } | null;
  const locationName = loc?.name ?? "";
  const recipes = (recipeRes.data as PrepItemIngredientRow[]) ?? [];
  // `prep_item_ingredients.raw_ingredient_id` may point to source-location raw IDs.
  // Remap those recipe rows by raw-ingredient name to this location's raw IDs.
  let recipesMappedToLocation: PrepItemIngredientRow[] = recipes;
  const unmatchedRecipeNames: string[] = [];
  const locationRawIdSet = new Set(rawIngredients.map((r) => r.id));
  const recipeRawIds = [...new Set(recipes.map((r) => r.raw_ingredient_id).filter(Boolean))];
  const missingRecipeRawIds = recipeRawIds.filter((id) => !locationRawIdSet.has(id));
  if (missingRecipeRawIds.length > 0) {
    const srcRawRes = await supabase
      .from("raw_ingredients")
      .select("id, name")
      .in("id", missingRecipeRawIds);
    const srcRawRows = (srcRawRes.data as { id: string; name: string }[]) ?? [];
    const srcNameById = Object.fromEntries(
      srcRawRows.map((r) => [r.id, normIngredientName(r.name)])
    );
    const locRawIdByName = Object.fromEntries(
      rawIngredients.map((r) => [normIngredientName(r.name), r.id])
    );
    const unmatchedNames = new Set<string>();
    recipesMappedToLocation = recipes
      .map((row) => {
        if (locationRawIdSet.has(row.raw_ingredient_id)) return row;
        const srcName = srcNameById[row.raw_ingredient_id];
        if (!srcName) return null;
        const mappedRawId = locRawIdByName[srcName];
        if (!mappedRawId) {
          unmatchedNames.add(srcName);
          return null;
        }
        return { ...row, raw_ingredient_id: mappedRawId };
      })
      .filter((row): row is PrepItemIngredientRow => Boolean(row));
    unmatchedRecipeNames.push(...unmatchedNames);
  }
  recipesMappedToLocation = dedupePrepItemIngredientRows(recipesMappedToLocation);
  const stockRows =
    (stockRes.data as { raw_ingredient_id: string; quantity: number; date: string }[]) ?? [];
  const prepStockRows =
    (prepQtyRes.data as { prep_item_id: string; quantity: number }[]) ?? [];
  const prepStockByPrepItemId = Object.fromEntries(
    prepStockRows.map((r) => [r.prep_item_id, Number(r.quantity)])
  );
  const currentStock = buildOrderingStockByRawId({
    rows: stockRows,
    todayDateStr: d,
    rawIngredients,
  });
  const stockListToday = stockRows.filter((s) => s.date === d);

  const schedulesBySupplierJsEarly: Record<string, number[]> = {};
  for (const s of schedules) {
    if (!schedulesBySupplierJsEarly[s.supplier_id]) schedulesBySupplierJsEarly[s.supplier_id] = [];
    schedulesBySupplierJsEarly[s.supplier_id].push(supplierScheduleDayToJsDay(s.day_of_week));
  }
  const bidfoodSupplier = suppliers.find((s) => normSupplierName(s.name) === "bidfood");
  const bidfoodDeliveryDays = bidfoodSupplier
    ? (schedulesBySupplierJsEarly[bidfoodSupplier.id] ?? [])
    : [];
  const coverDeliveryDays =
    bidfoodDeliveryDays.length > 0
      ? bidfoodDeliveryDays
      : (Object.values(schedulesBySupplierJsEarly).find((d) => d.length > 0) ?? []);
  const revenueCoverDates = coverWindowCalendarDates({
    today: todayForCover,
    deliveryDaysJs: coverDeliveryDays,
  });
  const revenueDatesToLoad = [...new Set([d, ...revenueCoverDates])];
  const revRowsRes = await supabase
    .from("daily_revenue_targets")
    .select("date, target_amount_cents")
    .eq("location_id", locationId)
    .in("date", revenueDatesToLoad);
  const revenueCentsByDate: Record<string, number | null> = { [d]: revCents };
  for (const row of (revRowsRes.data as { date: string; target_amount_cents: number | null }[]) ?? []) {
    revenueCentsByDate[row.date] = row.target_amount_cents;
  }
  // Build UNSCALED (full-capacity) prep need so revenue scaling happens
  // only once inside calcScaledNeedOverOrderWindow. A separate scaled map
  // is kept for prep-gating and medi-salad display where today's actual need matters.
  const neededByPrepItemId: Record<string, number> = {};
  const revenueMultiplier = getRevenueMultiplier({
    todayRevenueCents: revCents,
    fullCapacityRevenue: loc?.full_capacity_revenue ?? null,
  });
  const scaledNeededByPrepItemId: Record<string, number> = {};
  for (const row of lpi) {
    const prep = row.prep_items;
    if (!prep) continue;
    neededByPrepItemId[row.prep_item_id] = row.base_quantity ?? 0;
    scaledNeededByPrepItemId[row.prep_item_id] = calcNeededQuantity({
      baseQuantity: row.base_quantity ?? 0,
      revenueMultiplier,
    });
  }
  if (mediSaladPrepItemIdFromAll && neededByPrepItemId[mediSaladPrepItemIdFromAll] == null) {
    const mediRow = lpiAll.find((row) => row.prep_item_id === mediSaladPrepItemIdFromAll);
    neededByPrepItemId[mediSaladPrepItemIdFromAll] = mediRow?.base_quantity ?? 1;
    scaledNeededByPrepItemId[mediSaladPrepItemIdFromAll] = calcNeededQuantity({
      baseQuantity: mediRow?.base_quantity ?? 1,
      revenueMultiplier,
    });
  }
  const mediSaladNeedPrep = mediSaladPrepItemIdFromAll
    ? (scaledNeededByPrepItemId[mediSaladPrepItemIdFromAll] ?? 0)
    : 0;
  const locationPrepIds = new Set(lpi.map((row) => row.prep_item_id));
  const recipeFiltered = recipesMappedToLocation.filter(
    (r) => rawIds.has(r.raw_ingredient_id) && locationPrepIds.has(r.prep_item_id)
  );
  const dailyRawNeedBase = aggregateDailyRawNeedFromPrep({
    neededByPrepItemId,
    prepItemIngredients: recipeFiltered,
    prepYieldByPrepItemId,
  });
  const rawNameByRawId = Object.fromEntries(
    rawIngredients.map((r) => [r.id, r.name ?? ""])
  );
  const prepNameByPrepItemId = Object.fromEntries(
    lpiAll
      .map((row) => [row.prep_item_id, row.prep_items?.name ?? ""] as const)
      .filter(([, name]) => Boolean(name))
  );
  const prepStockCreditByRawId = computeRawCoveredByFinishedPrep({
    recipeFiltered,
    prepStockByPrepItemId,
    rawNameByRawId,
    prepNameByPrepItemId,
    prepYieldByPrepItemId,
  });
  const flatbreadPrepCredit = computeDefrostedFlatbreadRawCredit({
    prepItemsById: Object.fromEntries(
      lpiAll.map((row) => [row.prep_item_id, row.prep_items])
    ),
    prepStockByPrepItemId,
    rawIngredients,
  });
  for (const [rid, grams] of Object.entries(flatbreadPrepCredit)) {
    prepStockCreditByRawId[rid] = (prepStockCreditByRawId[rid] ?? 0) + grams;
  }
  const pickledPrepCredit = computePickledPrepRawCredit({
    prepItemsById: Object.fromEntries(
      lpiAll.map((row) => [row.prep_item_id, row.prep_items])
    ),
    prepStockByPrepItemId,
    rawIngredients,
  });
  for (const [rid, grams] of Object.entries(pickledPrepCredit)) {
    prepStockCreditByRawId[rid] = (prepStockCreditByRawId[rid] ?? 0) + grams;
  }
  let dailyRawNeed: Record<string, number> = { ...dailyRawNeedBase };
  const mediSaladPrepItemId = mediSaladPrepItemIdFromAll;
  dailyRawNeed = applyMediSaladVanGelderOverride({
    locationId,
    locationName,
    dailyRawNeed,
    neededByPrepItemId,
    recipeFiltered,
    rawIngredients,
    prepYieldByPrepItemId,
    mediSaladPrepItemId,
  });
  dailyRawNeed = applyDailyNeedMultipliers({
    dailyRawNeed,
    rawIngredients,
    locationId,
    locationName,
    locationOrderingByRawId,
  });
  dailyRawNeed = applyProductionGatedRawDailyNeed({
    locationId,
    locationName,
    dailyRawNeed,
    rawIngredients,
    recipeFiltered,
    locationPrepItems: lpi,
    prepStockByPrepItemId,
    currentRawStock: currentStock,
    revenueMultiplier,
    prepYieldByPrepItemId,
  });
  const productionGatedZeroRawIds = new Set(
    rawIngredients
      .filter(
        (ing) =>
          PRODUCTION_GATED_RAW_NAMES.has((ing.name ?? "").toLowerCase().trim()) &&
          (dailyRawNeed[ing.id] ?? 0) <= 0
      )
      .map((ing) => ing.id)
  );
  const prepLinkedRawIds = new Set(recipeFiltered.map((r) => r.raw_ingredient_id));
  const basePerStocktakeUnitByRawId: Record<string, number> = {};
  for (const ing of rawIngredients) {
    const packs = packSizes
      .filter((p) => p.raw_ingredient_id === ing.id)
      .map(normalizePackRow);
    const bps = basePerOneStocktakeInputUnit(ing, packs);
    if (bps != null && bps > 0) basePerStocktakeUnitByRawId[ing.id] = bps;
  }
  dailyRawNeed = mergeWeeklyIntervalDailyNeed({
    dailyRawNeed,
    rawIngredients,
    prepLinkedRawIds,
    basePerStocktakeUnitByRawId,
    recentCountedRawIds: new Set(stockRows.map((r) => r.raw_ingredient_id)),
    currentRawStock: currentStock,
  });
  const locationSupplierIds = new Set(
    ((supRes.data as { id: string }[]) ?? []).map((s) => s.id)
  );
  const siRows =
    (siRes.data as { supplier_id: string; raw_ingredient_id: string; is_preferred: boolean }[]) ?? [];
  const preferredSupplierIdByRaw: Record<string, string> = {};
  for (const r of siRows) {
    if (!locationSupplierIds.has(r.supplier_id)) continue;
    if (r.is_preferred) preferredSupplierIdByRaw[r.raw_ingredient_id] = r.supplier_id;
  }
  const supplierRawIds: Record<string, string[]> = {};
  const byRaw: Record<string, { supplier_id: string; is_preferred: boolean }[]> = {};
  for (const r of siRows) {
    if (!locationSupplierIds.has(r.supplier_id)) continue;
    const prefId = preferredSupplierIdByRaw[r.raw_ingredient_id];
    if (prefId && prefId !== r.supplier_id) continue;
    if (!supplierRawIds[r.supplier_id]) supplierRawIds[r.supplier_id] = [];
    if (!supplierRawIds[r.supplier_id].includes(r.raw_ingredient_id)) {
      supplierRawIds[r.supplier_id].push(r.raw_ingredient_id);
    }
    if (!byRaw[r.raw_ingredient_id]) byRaw[r.raw_ingredient_id] = [];
    byRaw[r.raw_ingredient_id].push(r);
  }
  const preferredSupplierByRawId: Record<string, string | null> = {};
  for (const rid of rawIdList) {
    const list = byRaw[rid];
    if (!list?.length) {
      preferredSupplierByRawId[rid] = null;
      continue;
    }
    const pref = list.find((x) => x.is_preferred);
    preferredSupplierByRawId[rid] = pref?.supplier_id ?? list[0].supplier_id;
  }
  const schedulesBySupplierJs: Record<string, number[]> = {};
  for (const s of schedules) {
    if (!schedulesBySupplierJs[s.supplier_id]) schedulesBySupplierJs[s.supplier_id] = [];
    schedulesBySupplierJs[s.supplier_id].push(supplierScheduleDayToJsDay(s.day_of_week));
  }
  const orderIntervalDaysByRawId = Object.fromEntries(
    rawIngredients.map((r) => [r.id, r.order_interval_days ?? null])
  );
  const supplierNameById = Object.fromEntries(
    ((supRes.data as { id: string; name: string }[]) ?? []).map((s) => [s.id, s.name])
  );
  const orderPackByRawId: Record<string, IngredientPackSize | null> = {};
  const picklingLeadTimeRawIds = new Set<string>();
  for (const ing of rawIngredients) {
    const packs = packsForOrder(
      packSizes.filter((p) => p.raw_ingredient_id === ing.id).map(normalizePackRow)
    );
    orderPackByRawId[ing.id] = getOrderPackDeterministic(packs) ?? getBestPackSize(packs);
    if (isPicklingRawName(ing.name)) picklingLeadTimeRawIds.add(ing.id);
  }
  const pitaStock = extractPitaStockCounts({
    prepItemsById: Object.fromEntries(
      lpi.map((row) => [row.prep_item_id, row.prep_items])
    ),
    prepStockByPrepItemId,
    rawIngredients,
    rawStockByRawId: currentStock,
  });
  const baseSuggested = applySupplierExcludedRawSuppress({
    rawIngredients,
    baseSuggested: applyWestSuppressedRawOrders({
    locationId,
    locationName,
    rawIngredients,
    baseSuggested: applyProductionGatedBaseSuggested({
    rawIngredients,
    gatedRawIdsWithZeroNeed: productionGatedZeroRawIds,
    baseSuggested: applyCombinedPitaStockCredit({
      ...pitaStock,
      rawIngredients,
      baseSuggested: applyAubergineSabichMinContainers({
      rawIngredients,
      locationPrepItems: lpi,
      prepStockByPrepItemId,
      currentRawStock: currentStock,
      baseSuggested: applyGarlicPeeledOrderGate({
      rawIngredients,
      currentRawStock: currentStock,
      baseSuggested: applyFlourOrderGate({
      rawIngredients,
      currentRawStock: currentStock,
      baseSuggested: applyLemonJuiceOrderGate({
      rawIngredients,
      currentRawStock: currentStock,
      baseSuggested: applyBakingPowderOrderGate({
      rawIngredients,
      currentRawStock: currentStock,
      baseSuggested: applyMediSaladBaseSuggestedCleanup({
        locationId,
        locationName,
        mediSaladPrepItemId,
        mediSaladNeedPrep,
        rawIngredients,
        baseSuggested: applyMinOrderBaseFloors({
          rawIngredients,
          baseSuggested: applyMaxOrderBaseCaps({
          rawIngredients,
          baseSuggested: applyMintBagWhenPrepShort({
            rawIngredients,
            locationPrepItems: lpi,
            prepStockByPrepItemId,
            currentRawStock: currentStock,
            revenueMultiplier,
            orderPackByRawId,
            baseSuggested: applyDrinkTrayParToBaseSuggested({
            rawIngredients,
            currentRawStock: currentStock,
            baseSuggested: applyStockParToBaseSuggested({
            rawIngredients,
            currentRawStock: currentStock,
            prepStockCreditByRawId,
            baseSuggested: applyPrepBatchIngredientShortfall({
              recipeFiltered,
              locationPrepItems: lpi,
              prepStockByPrepItemId,
              currentRawStock: currentStock,
              prepStockCreditByRawId,
              revenueMultiplier,
              prepYieldByPrepItemId,
              rawNameByRawId,
              baseSuggested: suggestOrderBaseQuantities({
              today: todayForCover,
              todayDateStr: d,
              dailyRawNeedAtFullCapacity: dailyRawNeed,
              currentRawStock: currentStock,
              prepStockCreditByRawId,
              preferredSupplierByRawId,
              schedulesBySupplierJs,
              orderIntervalDaysByRawId,
              orderingEveningDayFraction: loc?.ordering_evening_day_fraction,
              revenueCentsByDate,
              fullCapacityRevenue: loc?.full_capacity_revenue ?? null,
              picklingLeadTimeRawIds,
              picklingLeadTimeDays: PICKLING_LEAD_TIME_DAYS,
              supplierNameById,
            }),
            }),
            orderPackByRawId,
          }),
          }),
        }),
          }),
        }),
      }),
    }),
    }),
    }),
    }),
    }),
    }),
    }),
    }),
  });
  const baseRawIds = Object.keys(baseSuggested);
  /**
   * Load packs via raw_ingredients → nested ingredient_pack_sizes (same pattern as initial page load).
   * Direct queries on ingredient_pack_sizes with .in() can return 0 rows in some PostgREST/URL cases.
   */
  const packLoadErrors: string[] = [];
  let supplementalPacks: IngredientPackSize[] = [];
  type RawRowWithPacks = {
    id: string;
    ingredient_pack_sizes?: IngredientPackSize[] | IngredientPackSize | null;
  };
  const packsRes = await supabase
    .from("raw_ingredients")
    .select(
      `id, ingredient_pack_sizes ( id, raw_ingredient_id, size, size_unit, price_cents, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple )`
    )
    .eq("location_id", locationId)
    .limit(10000);
  if (packsRes.error) {
    packLoadErrors.push(`nested: ${String(packsRes.error.message)}`);
  } else {
    const rrows = (packsRes.data as RawRowWithPacks[]) ?? [];
    for (const row of rrows) {
      const nested = row.ingredient_pack_sizes;
      const plist = Array.isArray(nested) ? nested : nested != null ? [nested] : [];
      for (const p of plist) {
        supplementalPacks.push(normalizePackRow(p));
      }
    }
  }
  const dedupePackId = new Map<string, IngredientPackSize>();
  for (const p of supplementalPacks) {
    if (!dedupePackId.has(p.id)) dedupePackId.set(p.id, p);
  }
  supplementalPacks = Array.from(dedupePackId.values());
  /**
   * Always merge direct `ingredient_pack_sizes` rows: nested embed often returns only a subset
   * (same as initial page load). If we only ran this when nested was empty, most raws had no colli in the UI.
   */
  if (rawIdList.length > 0) {
    const packChunk = 100;
    for (let i = 0; i < rawIdList.length; i += packChunk) {
      const chunk = rawIdList.slice(i, i + packChunk);
      const pr = await supabase
        .from("ingredient_pack_sizes")
        .select(
          "id, raw_ingredient_id, size, size_unit, price_cents, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple"
        )
        .in("raw_ingredient_id", chunk);
      if (pr.error) {
        packLoadErrors.push(`in(): ${String(pr.error.message)}`);
        continue;
      }
      const rows = ((pr.data as IngredientPackSize[]) ?? []).map(normalizePackRow);
      for (const p of rows) {
        if (!dedupePackId.has(p.id)) {
          dedupePackId.set(p.id, p);
          supplementalPacks.push(p);
        }
      }
    }
  }
  const packsForRawMerged = (rid: string): IngredientPackSize[] => {
    const fromState = packSizes
      .filter((p) => p.raw_ingredient_id === rid)
      .map(normalizePackRow);
    const fromExtra = supplementalPacks.filter((p) => p.raw_ingredient_id === rid);
    const byId = new Map<string, IngredientPackSize>();
    for (const p of [...fromState, ...fromExtra]) {
      if (!byId.has(p.id)) byId.set(p.id, p);
    }
    return Array.from(byId.values());
  };
  const packAndUnitByRawId: Record<
    string,
    { pack: IngredientPackSize; rawUnit: string } | null
  > = {};
  for (const rid of baseRawIds) {
    const list = packsForRawMerged(rid);
    const forOrder = packsForOrder(list);
    let best = getOrderPackDeterministic(forOrder) ?? getBestPackSize(forOrder);
    if (!best && list.length > 0) best = getOrderPackDeterministic(list) ?? getBestPackSize(list);
    const ingRow = rawIngredients.find((r) => r.id === rid);
    packAndUnitByRawId[rid] =
      best && ingRow && best.size > 0
        ? { pack: best, rawUnit: ingRow.unit ?? "" }
        : null;
  }
  const packCounts = baseAmountsToPackCounts({
    baseByRawId: baseSuggested,
    packAndUnitByRawId,
  });
  const kindByRaw: Record<string, SuggestionOrderKind> = {};
  const finalSuggested: Record<string, number> = {};
  for (const [rid, baseAmt] of Object.entries(baseSuggested)) {
    if (baseAmt <= 0) continue;
    const ing = rawIngredients.find((r) => r.id === rid);
    if (isParsleyRawName(ing?.name)) {
      const split = parsleyOrderSplit(baseAmt);
      if (split.box4kg > 0 || split.bag1kg > 0) {
        finalSuggested[rid] = Math.max(split.box4kg, split.bag1kg, 1);
        kindByRaw[rid] = "pack";
      }
      continue;
    }
    const pc = packCounts[rid];
    if (pc != null && pc > 0) {
      if (!passesMinOrderPackThreshold(ing?.name, pc)) continue;
      const entry = packAndUnitByRawId[rid];
      const mult = ing?.order_pack_multiple ?? entry?.pack?.order_pack_multiple ?? 1;
      finalSuggested[rid] = applyOrderPackMultipleRounding(pc, mult);
      kindByRaw[rid] = "pack";
      continue;
    }
    const mergedPacks = packsForRawMerged(rid);
    const bps = ing ? basePerOneStocktakeInputUnit(ing, mergedPacks) : null;
    if (bps != null && bps > 0) {
      const stocktakePcs = Math.max(1, Math.ceil(baseAmt / bps));
      if (!passesMinOrderPackThreshold(ing?.name, stocktakePcs)) continue;
      const entry = packAndUnitByRawId[rid];
      const mult = ing?.order_pack_multiple ?? entry?.pack?.order_pack_multiple ?? 1;
      finalSuggested[rid] = applyOrderPackMultipleRounding(stocktakePcs, mult);
      kindByRaw[rid] = "stocktake";
    } else {
      finalSuggested[rid] = Math.max(1, Math.ceil(baseAmt));
      kindByRaw[rid] = "recipe";
    }
  }
  const suggestedAfterMinPacks = applyMinOrderPackThresholds({
    rawIngredients,
    suggestedPacks: finalSuggested,
  });
  const mediSaladPackCleanup = applyMediSaladSuggestedPacksCleanup({
    locationId,
    locationName,
    suggestedPacks: suggestedAfterMinPacks,
    kindByRaw: kindByRaw,
    rawIngredients,
    mediSaladNeedPrep,
  });
  const zuidasPackCleanup = applyZuidasStandingOrderPacks({
    locationId,
    locationName,
    suggestedPacks: mediSaladPackCleanup.suggestedPacks,
    kindByRaw: mediSaladPackCleanup.kindByRaw,
    rawIngredients,
    locationOrderingByRawId,
  });
  const drinkPackCleanup = applyDrinkTrayStandingPacks({
    rawIngredients,
    currentRawStock: currentStock,
    suggestedPacks: zuidasPackCleanup.suggestedPacks,
    kindByRaw: zuidasPackCleanup.kindByRaw,
  });
  const suggestedForUi: Record<string, number> = { ...drinkPackCleanup.suggestedPacks };
  const kindForUi: Record<string, SuggestionOrderKind> = {
    ...(drinkPackCleanup.kindByRaw as Record<string, SuggestionOrderKind>),
  };
  // Weekly stocktake items (e.g. honey sticks): only on their weekly day.
  const locationWeeklyDow = loc?.weekly_stocktake_day_of_week ?? null;
  for (const ing of rawIngredients) {
    if (!isWeeklyPlannedRaw(ing)) continue;
    if (
      isWeeklyStocktakeDueOnDate({
        dateStr: d,
        locationWeeklyDow,
        ingredientWeeklyDow: ing.stocktake_day_of_week,
      })
    ) {
      continue;
    }
    delete suggestedForUi[ing.id];
    delete kindForUi[ing.id];
    delete baseSuggested[ing.id];
  }
  for (const rid of Object.keys(finalSuggested)) {
    if (finalSuggested[rid] > 0 && suggestedAfterMinPacks[rid] == null) {
      delete kindForUi[rid];
    }
  }
  // Keep suggestions visible for all suppliers, including on-demand ones (Tuana/TFG/Gede/Java),
  // even when prep counts are incomplete.
  const suggestionLineCount = Object.keys(suggestedForUi).length;
  const packConversionLineCount = Object.values(kindForUi).filter((k) => k === "pack").length;
  const baseFallbackLineCount = Object.values(kindForUi).filter(
    (k) => k === "stocktake" || k === "recipe"
  ).length;
  const unassigned: string[] = [];
  for (const rawId of Object.keys(baseSuggested)) {
    if (preferredSupplierByRawId[rawId]) continue;
    const ing = rawIngredients.find((r) => r.id === rawId);
    if (ing && isSupplierOrderExcludedRawName(ing.name)) continue;
    unassigned.push(rawId);
  }
  const dailyRawNeedSum = Object.values(dailyRawNeed).reduce((a, b) => a + b, 0);
  const baseOrderNeedSum = Object.values(baseSuggested).reduce((a, b) => a + b, 0);

  // Snapshot of what the app advised today, with the inputs behind it. Built here
  // (not from UI state) so it records the suggestion itself, before manual edits.
  const snapshotRawIds = Array.from(
    new Set([...Object.keys(baseSuggested), ...Object.keys(suggestedForUi)])
  );
  const snapshotLines: OrderSuggestionSnapshotLine[] = snapshotRawIds
    .map((rawId) => {
      const ing = rawIngredients.find((r) => r.id === rawId);
      const { coverDates, picklingLeadDays } = orderCoverWindowForRaw({
        rawId,
        today: todayForCover,
        intervalDays: orderIntervalPlanningDays(orderIntervalDaysByRawId[rawId]),
        preferredSupplierId: preferredSupplierByRawId[rawId] ?? null,
        schedulesBySupplierJs,
        supplierNameById,
        picklingLeadTimeRawIds,
        picklingLeadTimeDays: PICKLING_LEAD_TIME_DAYS,
      });
      return {
        raw_ingredient_id: rawId,
        name: ing?.name ?? "",
        supplier_id: preferredSupplierByRawId[rawId] ?? null,
        suggested_base_qty: baseSuggested[rawId] ?? 0,
        suggested_packs: suggestedForUi[rawId] ?? 0,
        pack_multiple:
          ing?.order_pack_multiple ?? orderPackByRawId[rawId]?.order_pack_multiple ?? 1,
        days_cover: coverDates.length + picklingLeadDays,
        stock_at_count: currentStock[rawId] ?? 0,
        daily_need: dailyRawNeed[rawId] ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ok: true,
    prepStocktakeComplete: prepComplete,
    currentRawStockById: currentStock,
    currentPrepStockById: prepStockByPrepItemId,
    revenueTargetCents: revCents,
    supplierRawIdsBySupplier: supplierRawIds,
    snapshotLines,
    supplementalPackSizes: supplementalPacks,
    mediSaladNeedPrep,
    baseSuggestedByRaw: baseSuggested,
    suggestedOrder: suggestedForUi,
    suggestionOrderKindByRaw: kindForUi,
    suggestionSupplierByRaw: preferredSupplierByRawId,
    suggestedUnassignedRawIds: unassigned,
    stockRowsForDateCount: stockListToday.length,
    suggestionLineCount,
    insight: {
      dateUsed: d,
      prepLinkedCount: lpi.length,
      recipeRowsForLocation: recipeFiltered.length,
      dailyRawNeedSum,
      baseOrderNeedSum,
      suggestionLineCount,
      packRowsLoadedFromDb: supplementalPacks.length,
      packFetchError: packLoadErrors.length > 0 ? packLoadErrors.join(" · ") : null,
      locationRawCount: rawIdList.length,
      stockRowsForDate: stockListToday.length,
      revenueCoverDates,
      revenueEveningDate: d,
      packConversionLineCount,
      baseFallbackLineCount,
      unmatchedRecipeNames,
    },
  };
}
