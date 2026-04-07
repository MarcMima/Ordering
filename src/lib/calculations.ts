/**
 * Business logic for kitchen operations.
 * All functions are pure; no side effects or component coupling.
 */

import type { IngredientPackSize } from "@/lib/types";
import type { PrepItemYieldMeta } from "@/lib/prepRecipeYield";
import { packSizeToBaseAmount } from "@/lib/stocktakeRawPackMath";

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
 * Days until next delivery given delivery days (0=Sun … 6=Sat, JS).
 * Returns 0 if today is a delivery day (same calendar day as a delivery).
 */
export function daysUntilNextDelivery(params: {
  today: Date;
  deliveryDays: number[];
}): number {
  const { today, deliveryDays } = params;
  if (deliveryDays.length === 0) return 7;
  const todayD = getDayOfWeek(today);
  let min = 8;
  for (const d of deliveryDays) {
    let diff = d - todayD;
    if (diff < 0) diff += 7;
    if (diff === 0) return 0;
    if (diff < min) min = diff;
  }
  return min;
}

/**
 * True when **tomorrow** (calendar day after `stocktakeDate`) is a scheduled delivery day
 * for this raw's preferred supplier.
 *
 * Do not use {@link daysUntilNextDelivery} === 1 here: that returns **0** when *today* is
 * already a delivery day, which wrongly hid all Daily items whenever stocktake ran on a
 * leverdag (Mon–Sat for suppliers like Van Gelder).
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
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowD = getDayOfWeek(tomorrow);
  return deliveryDays.includes(tomorrowD);
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
 * Suggested order quantity: (needed_per_day × days_until_delivery) - current_stock.
 * Minimum 0.
 */
export function calcOrderQty(params: {
  neededPerDay: number;
  daysUntilDelivery: number;
  currentStock: number;
}): number {
  const { neededPerDay, daysUntilDelivery, currentStock } = params;
  const totalNeeded = neededPerDay * Math.max(1, daysUntilDelivery);
  return Math.max(0, Math.ceil(totalNeeded - currentStock));
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
 * Calculates the quantity needed of an ingredient based on current stock,
 * target/required level, and optional usage rate.
 */
export function calculateNeeded(params: {
  currentStock: number;
  targetLevel: number;
  usageRate?: number;
}): number {
  const { currentStock, targetLevel, usageRate = 0 } = params;
  const needed = targetLevel - currentStock - usageRate;
  return Math.max(0, needed);
}

/**
 * Computes a priority score for prep/ordering (higher = more urgent).
 */
export function calculatePriority(params: {
  currentLevel: number;
  targetLevel: number;
  weight?: number;
  daysUntilDue?: number;
}): number {
  const { currentLevel, targetLevel, weight = 1, daysUntilDue = 7 } = params;
  const shortfall = Math.max(0, targetLevel - currentLevel);
  const urgency = shortfall > 0 ? 1 + 1 / Math.max(1, daysUntilDue) : 0;
  return shortfall * weight * urgency;
}

/**
 * Total net content when stock is counted in units (bottles, containers).
 * Returns null if content_amount not set.
 */
export function totalContentInBaseUnit(params: {
  countUnits: number;
  contentAmount: number | null | undefined;
  contentUnit: string | null | undefined;
}): number | null {
  const { countUnits, contentAmount, contentUnit } = params;
  if (contentAmount == null || contentAmount <= 0) return null;
  const u = (contentUnit || "").toLowerCase().trim();
  // Normalize to grams for g/kg; ml kept as-is caller may treat separately
  if (u === "g" || u === "gram" || u === "grams") return countUnits * contentAmount;
  if (u === "kg") return countUnits * contentAmount * 1000;
  if (u === "ml") return countUnits * contentAmount;
  if (u === "l") return countUnits * contentAmount * 1000;
  // Unknown unit: treat as multiplier only
  return countUnits * contentAmount;
}

export type PrepItemIngredientRow = {
  prep_item_id: string;
  raw_ingredient_id: string;
  quantity_per_unit: number;
};

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

/**
 * Order quantity: one-off evening need + full days × daily need, then − stock.
 * `total = dailyNeed × (eveningFraction + coverFullDays)` — evening counts once, not per day.
 */
export function calcOrderQtyWithEveningOnce(params: {
  dailyNeed: number;
  /** Full days to cover from first to second upcoming delivery window (minimum 1). */
  coverFullDays: number;
  /** e.g. 0.66 → 66% of one day need for the single evening after order. */
  eveningFraction?: number | null;
  currentStock: number;
}): number {
  let f = params.eveningFraction;
  if (f == null || !Number.isFinite(f) || f < 0) f = DEFAULT_ORDERING_EVENING_DAY_FRACTION;
  const D = Math.max(1, params.coverFullDays);
  const totalNeeded = params.dailyNeed * (f + D);
  return Math.max(0, Math.ceil(totalNeeded - params.currentStock));
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
 * Suggested order quantity in **base units** (e.g. g) per raw ingredient:
 * `dailyNeed × (eveningFraction + effectiveCoverDays) − stock`, with evening applied once (post–17:00 window).
 * Cover days: time from the **next** delivery to the **following** delivery (see
 * {@link daysCoverUntilFollowingDelivery}), combined with Ingredient “Order planning (days)” when ≥2.
 */
export function suggestOrderBaseQuantities(params: {
  today: Date;
  dailyRawNeed: Record<string, number>;
  currentRawStock: Record<string, number>;
  preferredSupplierByRawId: Record<string, string | null | undefined>;
  schedulesBySupplierJs: Record<string, number[]>;
  orderIntervalDaysByRawId: Record<string, number | null | undefined>;
  /** Location: fraction of one day need for the single evening (default 2/3). */
  orderingEveningDayFraction?: number | null;
}): Record<string, number> {
  const {
    today,
    dailyRawNeed,
    currentRawStock,
    preferredSupplierByRawId,
    schedulesBySupplierJs,
    orderIntervalDaysByRawId,
    orderingEveningDayFraction,
  } = params;
  const suggested: Record<string, number> = {};
  for (const [rawId, dailyNeed] of Object.entries(dailyRawNeed)) {
    if (dailyNeed <= 0) continue;
    const stock = currentRawStock[rawId] ?? 0;
    const intervalDays = intervalPlanningDays(orderIntervalDaysByRawId[rawId]);
    const supplierId = preferredSupplierByRawId[rawId] ?? null;
    let coverDays: number;
    if (supplierId) {
      const sched = schedulesBySupplierJs[supplierId] ?? [];
      coverDays =
        sched.length > 0
          ? daysCoverUntilFollowingDelivery({ today, deliveryDays: sched })
          : 7;
    } else {
      coverDays = intervalDays;
    }
    const effectiveCover = Math.max(coverDays, intervalDays);
    const base = calcOrderQtyWithEveningOnce({
      dailyNeed,
      coverFullDays: effectiveCover,
      eveningFraction: orderingEveningDayFraction,
      currentStock: stock,
    });
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
