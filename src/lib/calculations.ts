/**
 * Business logic for kitchen operations.
 * All functions are pure; no side effects or component coupling.
 */

import { localCalendarDateString } from "@/lib/date";
import type { IngredientPackSize } from "@/lib/types";
import type { PrepItemYieldMeta } from "@/lib/prepRecipeYield";
import { packSizeToBaseAmount } from "@/lib/stocktakeRawPackMath";
import { isDailyReorderSupplierName } from "@/lib/supplierOrderChannel";

/** 0 = Sunday, 6 = Saturday (JS getDay()) */
export function getDayOfWeek(date: Date): number {
  return date.getDay();
}

/**
 * Revenue ratio for the day: (today revenue €) / full_capacity_revenue.
 * No weekend bump — ordering/prep use delivery schedules elsewhere; avoid double-counting.
 * Pass `todayRevenueCents: null` when there is **no** daily target row for this date (plan as a full day, multiplier 1).
 * Pass `0` when the target is explicitly zero (e.g. closed).
 */
export function getRevenueMultiplier(params: {
  todayRevenueCents: number | null;
  fullCapacityRevenue: number | null;
}): number {
  const { todayRevenueCents, fullCapacityRevenue } = params;
  if (!fullCapacityRevenue || fullCapacityRevenue <= 0) return 1;
  if (todayRevenueCents == null) return 1;
  const ratio = todayRevenueCents / 100 / fullCapacityRevenue;
  return Math.max(0, ratio);
}

/**
 * Quantity needed today: base_quantity × revenue_multiplier.
 */
export function calcNeededQuantity(params: {
  baseQuantity: number;
  revenueMultiplier: number;
}): number {
  const { baseQuantity, revenueMultiplier } = params;
  return Math.max(0, baseQuantity * revenueMultiplier);
}

/**
 * How much to make: needed - current_stock, minimum 0, rounded up to batch_size.
 */
export function calcToMake(params: {
  needed: number;
  currentStock: number;
  batchSize: number | null;
}): number {
  const { needed, currentStock, batchSize } = params;
  const shortfall = Math.max(0, needed - currentStock);
  if (shortfall <= 0) return 0;
  if (batchSize == null || batchSize <= 0) return Math.ceil(shortfall);
  return Math.ceil(shortfall / batchSize) * batchSize;
}

export { formatDecimal2, formatEuroFromCents, formatPrepQuantity } from "./format";

export type PrepPriority = 1 | 2 | 3 | "hidden";

/**
 * Priority 1 (red) = stock < 10% of needed
 * Priority 2 (amber) = stock 10–40% of needed
 * Priority 3 (green) = stock 40–99% of needed
 * Hidden = stock >= 100% of needed
 * If prep_time_hours > 2, bump priority up by 1 level (1 stays 1, 2→1, 3→2, hidden→3).
 */
export function getPrepPriority(params: {
  currentStock: number;
  needed: number;
  prepTimeHours: number | null;
}): PrepPriority {
  const { currentStock, needed, prepTimeHours } = params;
  if (needed <= 0) return "hidden";
  const pct = currentStock / needed;
  let priority: PrepPriority =
    pct >= 1 ? "hidden" : pct < 0.1 ? 1 : pct < 0.4 ? 2 : 3;
  const bump = prepTimeHours != null && prepTimeHours > 2;
  if (bump && priority === 3) priority = 2;
  if (bump && priority === 2) priority = 1;
  if (bump && priority === "hidden") priority = 3;
  return priority;
}

/**
 * Admin UI stores supplier delivery weekdays as 0=Monday … 6=Sunday.
 * JS `Date.getDay()` uses 0=Sunday … 6=Saturday.
 */
export function supplierScheduleDayToJsDay(dbDay: number): number {
  return ((dbDay % 7) + 1) % 7;
}

/**
 * Days until delivery when placing an order today (always ≥ 1).
 * Orders are never same-day delivery — use this for ordering UI labels.
 */
export function daysUntilDeliveryWhenOrderingToday(params: {
  today: Date;
  deliveryDays: number[];
}): number {
  const { today, deliveryDays } = params;
  if (deliveryDays.length === 0) return 1;
  for (let delta = 1; delta <= 7; delta++) {
    const candidate = addCalendarDays(today, delta);
    if (deliveryDays.includes(getDayOfWeek(candidate))) {
      return delta;
    }
  }
  return 1;
}

/**
 * True when **tomorrow** (calendar day after `stocktakeDate`) is a scheduled delivery day
 * for this raw's preferred supplier.
 *
 * Checks the calendar day after `stocktakeDate`, not today itself, to avoid wrongly hiding
 * Daily items whenever stocktake runs on a leverdag (Mon–Sat for suppliers like Van Gelder).
 */
export function isRawDeliverableTomorrow(params: {
  stocktakeDate: string;
  rawId: string;
  preferredSupplierByRawId: Record<string, string | null>;
  schedulesBySupplierJs: Record<string, number[]>;
}): boolean {
  const supplierId = params.preferredSupplierByRawId[params.rawId];
  if (!supplierId) return false;
  const deliveryDays = params.schedulesBySupplierJs[supplierId] ?? [];
  if (deliveryDays.length === 0) return false;
  const today = new Date(`${params.stocktakeDate}T12:00:00`);
  return isNextCalendarDayDelivery({ fromDate: today, deliveryDays });
}

/**
 * True when the **next** calendar day after `fromDate` is a scheduled delivery day.
 * Same rule as stocktake “daily” raws (count today → truck tomorrow). Use for ordering visibility.
 */
export function isNextCalendarDayDelivery(params: {
  fromDate: Date;
  deliveryDays: number[];
}): boolean {
  const { fromDate, deliveryDays } = params;
  if (deliveryDays.length === 0) return false;
  const tomorrow = addCalendarDays(fromDate, 1);
  return deliveryDays.includes(getDayOfWeek(tomorrow));
}

/**
 * How many calendar days to cover with stock until the *next* delivery after today
 * (ordering late on a delivery day still means you wait until the following delivery).
 * `deliveryDays` must be JS weekdays (0=Sun … 6=Sat); use {@link supplierScheduleDayToJsDay} for DB values.
 */
export function daysCoverUntilNextDelivery(params: {
  today: Date;
  deliveryDays: number[];
}): number {
  const { today, deliveryDays } = params;
  if (deliveryDays.length === 0) return 7;
  const todayD = getDayOfWeek(today);
  let min = 8;
  for (const d of deliveryDays) {
    let k = (d - todayD + 7) % 7;
    if (k === 0) k = 7;
    if (k < min) min = k;
  }
  return min;
}

function addCalendarDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Smallest positive number of calendar days from `startDate` to a delivery weekday
 * (never same calendar day — use for "next levering ná deze leverdag").
 */
export function daysUntilStrictlyAfterDeliveryDay(params: {
  startDate: Date;
  deliveryDays: number[];
}): number {
  const { startDate, deliveryDays } = params;
  if (deliveryDays.length === 0) return 7;
  for (let delta = 1; delta <= 14; delta++) {
    const dt = addCalendarDays(startDate, delta);
    if (deliveryDays.includes(getDayOfWeek(dt))) return delta;
  }
  return 7;
}

/**
 * Full days of daily demand to cover: from the **first** upcoming delivery until the **next**
 * delivery after that (e.g. order Sunday for Monday truck → stock must last until Thursday’s
 * order/delivery, i.e. Mon–Wed consumption = days from Monday to Thursday).
 *
 * Zie {@link daysCoverUntilNextDelivery} voor dagen tot de eerstvolgende levering; deze functie
 * gebruikt de periode **tussen** die levering en de daaropvolgende.
 */
export function daysCoverUntilFollowingDelivery(params: {
  today: Date;
  deliveryDays: number[];
}): number {
  const { today, deliveryDays } = params;
  if (deliveryDays.length === 0) return 7;
  const toFirst = daysCoverUntilNextDelivery({ today, deliveryDays });
  const firstDeliveryDate = addCalendarDays(today, toFirst);
  const untilFollowing = daysUntilStrictlyAfterDeliveryDay({
    startDate: firstDeliveryDate,
    deliveryDays,
  });
  return Math.max(1, untilFollowing);
}

/**
 * Most cost-efficient pack size: lowest price per unit (price_cents / size).
 * Returns the pack size id or null if none have price.
 */
export function getBestPackSize<T extends { id: string; size: number; price_cents?: number | null }>(
  packSizes: T[]
): T | null {
  const valid = packSizes.filter((p) => p.size > 0);
  if (valid.length === 0) return null;

  const priced = valid.filter((p) => (p.price_cents ?? 0) > 0);
  if (priced.length > 0) {
    let best: T | null = null;
    let bestUnitPrice = Infinity;
    for (const p of priced) {
      const unitPrice = (p.price_cents ?? 0) / p.size;
      if (unitPrice < bestUnitPrice) {
        bestUnitPrice = unitPrice;
        best = p;
      }
    }
    return best;
  }

  // No prices: still need a pack for order quantities — use the largest size (typical wholesale unit).
  return valid.reduce((a, b) => (a.size >= b.size ? a : b));
}

/**
 * Deterministic order-pack selection: prefers pack_purpose='order', then 'both',
 * then any. Tie-breaks on lowest id (stable across price changes).
 * Never uses price — prevents colli from flipping when prices change.
 */
export function getOrderPackDeterministic<
  T extends { id: string; size: number; pack_purpose?: string | null }
>(packSizes: T[]): T | null {
  const valid = packSizes.filter((p) => p.size > 0);
  if (valid.length === 0) return null;
  const purposeRank = (p: T) => {
    const pp = (p.pack_purpose ?? "").toLowerCase();
    if (pp === "order") return 0;
    if (pp === "both") return 1;
    return 2;
  };
  return valid.sort((a, b) => {
    const ra = purposeRank(a);
    const rb = purposeRank(b);
    if (ra !== rb) return ra - rb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

export type PrepItemIngredientRow = {
  prep_item_id: string;
  raw_ingredient_id: string;
  quantity_per_unit: number;
};

/** One row per prep→raw link (DB may store duplicate rows per location before ID remap). */
export function dedupePrepItemIngredientRows(
  rows: PrepItemIngredientRow[]
): PrepItemIngredientRow[] {
  const seen = new Set<string>();
  const out: PrepItemIngredientRow[] = [];
  for (const row of rows) {
    const key = `${row.prep_item_id}:${row.raw_ingredient_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * From "to make" per prep item and recipe (prep_item_ingredients), compute how much of each
 * raw ingredient is needed. Then subtract current raw stock to get suggested order quantity.
 * `orderIntervalDaysByRawId`: multiply positive shortfall by this many days (e.g. 7 for weekly spices).
 * Returns map raw_ingredient_id -> quantity to order (>= 0).
 */
export function calcSuggestedOrderFromPrep(params: {
  toMakeByPrepItem: Record<string, number>;
  prepItemIngredients: PrepItemIngredientRow[];
  currentRawStock: Record<string, number>;
  /** raw_ingredient_id -> planning horizon days; missing/null/<2 treated as 1 */
  orderIntervalDaysByRawId?: Record<string, number | null | undefined>;
}): Record<string, number> {
  const { toMakeByPrepItem, prepItemIngredients, currentRawStock, orderIntervalDaysByRawId } = params;
  const needed: Record<string, number> = {};
  for (const row of prepItemIngredients) {
    const toMake = toMakeByPrepItem[row.prep_item_id] ?? 0;
    if (toMake <= 0) continue;
    const add = toMake * row.quantity_per_unit;
    needed[row.raw_ingredient_id] = (needed[row.raw_ingredient_id] ?? 0) + add;
  }
  const suggested: Record<string, number> = {};
  for (const [rawId, need] of Object.entries(needed)) {
    const stock = currentRawStock[rawId] ?? 0;
    const rawInterval = orderIntervalDaysByRawId?.[rawId];
    const days =
      rawInterval != null && Number.isFinite(rawInterval) && rawInterval >= 2
        ? Math.floor(rawInterval)
        : 1;
    const shortfall = need - stock;
    const order = Math.max(0, Math.ceil(shortfall * days));
    if (order > 0) suggested[rawId] = order;
  }
  return suggested;
}

/** Default evening slice: ~2/3 of one day need for the window after ~17:00 until midnight (applied once per order). */
export const DEFAULT_ORDERING_EVENING_DAY_FRACTION = 2 / 3;

/** Calendar dates to cover: from first upcoming delivery through the day before the next delivery. */
export function coverWindowCalendarDates(params: {
  today: Date;
  deliveryDaysJs: number[];
}): string[] {
  const { today, deliveryDaysJs } = params;
  if (deliveryDaysJs.length === 0) return [];
  const toFirst = daysCoverUntilNextDelivery({ today, deliveryDays: deliveryDaysJs });
  const coverDays = daysCoverUntilFollowingDelivery({ today, deliveryDays: deliveryDaysJs });
  const firstDelivery = addCalendarDays(today, toFirst);
  const dates: string[] = [];
  for (let i = 0; i < coverDays; i++) {
    dates.push(localCalendarDateString(addCalendarDays(firstDelivery, i)));
  }
  return dates;
}

function fallbackCoverCalendarDates(today: Date, count: number): string[] {
  const dates: string[] = [];
  for (let i = 1; i <= Math.max(1, count); i++) {
    dates.push(localCalendarDateString(addCalendarDays(today, i)));
  }
  return dates;
}

/**
 * Scale €4.500 baseline daily need across cover days (each day's revenue target) plus one evening
 * (ordering day revenue × evening fraction).
 */
export function calcScaledNeedOverOrderWindow(params: {
  /** Daily need at full capacity (€4.500); revenue targets scale this per calendar day. */
  dailyNeedAtFullCapacity: number;
  coverDates: string[];
  /** Local calendar date of the ordering day (evening slice uses this day's revenue). */
  eveningDate: string;
  eveningFraction?: number | null;
  /**
   * Missing future date inherits the ordering day's target (forecast applies to
   * the whole window); no target anywhere → full-capacity day (multiplier 1).
   */
  revenueCentsByDate: Record<string, number | null | undefined>;
  fullCapacityRevenue: number | null;
  /** Extra full days of raw need (e.g. pickling lead time), scaled by evening date revenue. */
  extraFullDays?: number;
}): number {
  const {
    dailyNeedAtFullCapacity,
    coverDates,
    eveningDate,
    revenueCentsByDate,
    fullCapacityRevenue,
    extraFullDays = 0,
  } = params;
  if (dailyNeedAtFullCapacity <= 0) return 0;

  const eveningCents = revenueCentsByDate[eveningDate];
  const multForDate = (date: string) => {
    let cents = revenueCentsByDate[date];
    // Weekend/future rows are usually not entered yet on the ordering day;
    // planning them at 100% capacity systematically over-orders (e.g. Friday
    // chicken). Inherit the ordering day's forecast instead.
    if (cents === undefined) cents = eveningCents;
    return getRevenueMultiplier({
      todayRevenueCents: cents === undefined ? null : cents,
      fullCapacityRevenue,
    });
  };

  let sum = 0;
  for (const date of coverDates) {
    sum += dailyNeedAtFullCapacity * multForDate(date);
  }
  let f = params.eveningFraction;
  if (f == null || !Number.isFinite(f) || f < 0) f = DEFAULT_ORDERING_EVENING_DAY_FRACTION;
  sum += dailyNeedAtFullCapacity * f * multForDate(eveningDate);
  if (extraFullDays > 0) {
    sum += dailyNeedAtFullCapacity * extraFullDays * multForDate(eveningDate);
  }
  return sum;
}

export function aggregateDailyRawNeedFromPrep(params: {
  neededByPrepItemId: Record<string, number>;
  prepItemIngredients: PrepItemIngredientRow[];
  /**
   * Per prep item: nominaal gewicht per telt-eenheid vs recept-output; als ingredientQtyPerRecipeBatch,
   * wordt raw need geschaald met nominalG / recipeG (quantity_per_unit = voor volledige batch).
   */
  prepYieldByPrepItemId?: Record<string, PrepItemYieldMeta>;
}): Record<string, number> {
  const { neededByPrepItemId, prepItemIngredients, prepYieldByPrepItemId } = params;
  const daily: Record<string, number> = {};
  for (const row of prepItemIngredients) {
    const needPrep = neededByPrepItemId[row.prep_item_id] ?? 0;
    if (needPrep <= 0) continue;
    let factor = 1;
    const meta = prepYieldByPrepItemId?.[row.prep_item_id];
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
    const add = needPrep * row.quantity_per_unit * factor;
    daily[row.raw_ingredient_id] = (daily[row.raw_ingredient_id] ?? 0) + add;
  }
  return daily;
}

function intervalPlanningDays(rawInterval: number | null | undefined): number {
  if (rawInterval != null && Number.isFinite(rawInterval) && rawInterval >= 2) {
    return Math.floor(rawInterval);
  }
  return 1;
}

/**
 * Cover window for one raw ingredient: the calendar dates its suggested quantity must
 * bridge, plus any pickling lead days added on top as extra full days.
 *
 * Shared by `suggestOrderBaseQuantities` (which scales the daily need across these
 * dates) and by callers that need to report the coverage, so the reported number of
 * days can never drift from the number the quantity was actually computed against.
 */
export function orderCoverWindowForRaw(params: {
  rawId: string;
  today: Date;
  /** Planning interval in days, already normalised via the raw's order_interval_days. */
  intervalDays: number;
  preferredSupplierId: string | null;
  schedulesBySupplierJs: Record<string, number[]>;
  supplierNameById?: Record<string, string>;
  picklingLeadTimeRawIds?: ReadonlySet<string>;
  picklingLeadTimeDays?: number;
}): { coverDates: string[]; picklingLeadDays: number } {
  const {
    rawId,
    today,
    intervalDays,
    preferredSupplierId,
    schedulesBySupplierJs,
    supplierNameById,
    picklingLeadTimeRawIds,
    picklingLeadTimeDays = 0,
  } = params;
  const sched = preferredSupplierId ? (schedulesBySupplierJs[preferredSupplierId] ?? []) : [];
  const supplierName = preferredSupplierId ? supplierNameById?.[preferredSupplierId] : undefined;
  const dailyReorder = supplierName != null && isDailyReorderSupplierName(supplierName);
  let coverDates =
    sched.length > 0
      ? coverWindowCalendarDates({ today, deliveryDaysJs: sched })
      : fallbackCoverCalendarDates(today, Math.max(intervalDays, 1));
  if (dailyReorder) {
    coverDates = fallbackCoverCalendarDates(today, 1);
  } else if (coverDates.length < intervalDays) {
    coverDates = fallbackCoverCalendarDates(today, intervalDays);
  }
  const picklingLeadDays =
    !dailyReorder && picklingLeadTimeRawIds?.has(rawId) && picklingLeadTimeDays > 0
      ? picklingLeadTimeDays
      : 0;
  return { coverDates, picklingLeadDays };
}

/** Planning interval in days for a raw ingredient (order_interval_days, min 1). */
export function orderIntervalPlanningDays(rawInterval: number | null | undefined): number {
  return intervalPlanningDays(rawInterval);
}

/**
 * Suggested order quantity in **base units** per raw ingredient:
 * sum over cover days of (baseline daily need × that day's revenue ratio) + evening slice − stock.
 * Baseline daily need is at €4.500; each day's target scales linearly (€2.250 → half, €9.000 → double).
 */
export function suggestOrderBaseQuantities(params: {
  today: Date;
  todayDateStr: string;
  /** Daily raw need at full capacity (revenue multiplier 1). */
  dailyRawNeedAtFullCapacity: Record<string, number>;
  currentRawStock: Record<string, number>;
  /** Finished prep on hand (g/ml/pcs), subtracted after cover-window scaling — not from daily rate. */
  prepStockCreditByRawId?: Record<string, number>;
  preferredSupplierByRawId: Record<string, string | null | undefined>;
  schedulesBySupplierJs: Record<string, number[]>;
  orderIntervalDaysByRawId: Record<string, number | null | undefined>;
  orderingEveningDayFraction?: number | null;
  revenueCentsByDate: Record<string, number | null | undefined>;
  fullCapacityRevenue: number | null;
  /** Raw IDs that need an extra day of stock for pickling before use. */
  picklingLeadTimeRawIds?: ReadonlySet<string>;
  picklingLeadTimeDays?: number;
  supplierNameById?: Record<string, string>;
}): Record<string, number> {
  const {
    today,
    todayDateStr,
    dailyRawNeedAtFullCapacity,
    currentRawStock,
    prepStockCreditByRawId,
    preferredSupplierByRawId,
    schedulesBySupplierJs,
    orderIntervalDaysByRawId,
    orderingEveningDayFraction,
    revenueCentsByDate,
    fullCapacityRevenue,
    picklingLeadTimeRawIds,
    picklingLeadTimeDays = 0,
    supplierNameById,
  } = params;
  const suggested: Record<string, number> = {};
  for (const [rawId, dailyNeed] of Object.entries(dailyRawNeedAtFullCapacity)) {
    if (dailyNeed <= 0) continue;
    const stock = currentRawStock[rawId] ?? 0;
    const intervalDays = intervalPlanningDays(orderIntervalDaysByRawId[rawId]);
    const { coverDates, picklingLeadDays: picklingLead } = orderCoverWindowForRaw({
      rawId,
      today,
      intervalDays,
      preferredSupplierId: preferredSupplierByRawId[rawId] ?? null,
      schedulesBySupplierJs,
      supplierNameById,
      picklingLeadTimeRawIds,
      picklingLeadTimeDays,
    });
    const scaledNeed = calcScaledNeedOverOrderWindow({
      dailyNeedAtFullCapacity: dailyNeed,
      coverDates,
      eveningDate: todayDateStr,
      eveningFraction: orderingEveningDayFraction,
      revenueCentsByDate,
      fullCapacityRevenue,
      extraFullDays: picklingLead,
    });
    const prepCredit = prepStockCreditByRawId?.[rawId] ?? 0;
    const base = Math.max(0, Math.ceil(scaledNeed - stock - prepCredit));
    if (base > 0) suggested[rawId] = base;
  }
  return suggested;
}

/**
 * Round n up to a multiple of m (e.g. supplier only ships packs in pairs: m=2 → 1 pack becomes 2).
 * n is typically a positive integer pack count; m ≥ 1.
 */
export function roundUpToMultiple(n: number, m: number): number {
  if (!Number.isFinite(n) || n <= 0) return n;
  const mm = Math.max(1, Math.floor(Number(m)));
  if (mm <= 1) return Math.max(1, Math.ceil(n));
  return Math.max(mm, Math.ceil(n / mm) * mm);
}

/**
 * Apply supplier colli / MOQ to an order quantity in packs.
 * `orderPackMultiple` is a step: order in multiples of this many packs
 * (raw_ingredients.order_pack_multiple, e.g. medi salad in pairs, tahini per 12
 * buckets). The quantity stays expressed in supplier order units — never divide
 * it into colli groups, or the dispatched amount shrinks by the colli factor.
 */
export function applyOrderPackMultipleRounding(
  count: number,
  orderPackMultiple: number
): number {
  if (!Number.isFinite(count) || count <= 0) return count;
  return roundUpToMultiple(count, orderPackMultiple);
}

/**
 * Convert base-unit amounts (same unit as recipes / stock) to numbers of order packs (ceil).
 * Uses {@link packSizeToBaseAmount} so pack `size` + `size_unit` match the raw's unit (e.g. g need vs kg pack).
 */
export function baseAmountsToPackCounts(params: {
  baseByRawId: Record<string, number>;
  packAndUnitByRawId: Record<
    string,
    { pack: IngredientPackSize; rawUnit: string } | null | undefined
  >;
}): Record<string, number> {
  const { baseByRawId, packAndUnitByRawId } = params;
  const out: Record<string, number> = {};
  for (const [rawId, baseAmt] of Object.entries(baseByRawId)) {
    if (baseAmt <= 0) continue;
    const entry = packAndUnitByRawId[rawId];
    if (!entry?.pack) continue;
    const basePerPack = packSizeToBaseAmount(entry.pack, entry.rawUnit);
    if (basePerPack == null || basePerPack <= 0) continue;
    out[rawId] = Math.max(1, Math.ceil(baseAmt / basePerPack));
  }
  return out;
}
