"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { ChickpeaSoakCallout } from "@/components/ChickpeaSoakCallout";
import { DailyWorkflowStepper } from "@/components/DailyWorkflowStepper";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import type { Supplier, RawIngredient, IngredientPackSize, PrepItem, RawIngredientLocationOrdering } from "@/lib/types";
import { buildYieldMetaForPrepItem, type PrepItemYieldMeta } from "@/lib/prepRecipeYield";
import {
  daysUntilDeliveryWhenOrderingToday,
  getDayOfWeek,
  isNextCalendarDayDelivery,
  isRawDeliverableTomorrow,
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
  type PrepItemIngredientRow,
} from "@/lib/calculations";
import { formatDecimal2, formatOrderAmount, formatPrepQuantity } from "@/lib/format";
import { localCalendarDateString, shiftCalendarDateString } from "@/lib/date";
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
  locationUsesVanGelderMediSaladTub,
  mergeWeeklyIntervalDailyNeed,
  isSupplierOrderExcludedRawName,
  normRawIngredientName,
  parsleyOrderLines,
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
  applyWholewheatPitaMinBox,
  calcRegularPitaZaatarToMake,
  extractPitaStockCounts,
  isRegularPitaPrepName,
  isWholewheatPitaPrepName,
} from "@/lib/pitaPrepStock";
import { soakDryChickpeasKgFromPrepState } from "@/lib/chickpeaSoakPrepNeed";
import { isOnDemandSupplierName } from "@/lib/supplierOrderChannel";
import { JS_WEEKDAY_LABELS, isWeeklyPlannedRaw } from "@/lib/stocktakeWeek";
import { isWeeklyStocktakeDueOnDate, buildOrderingStockByRawId } from "@/lib/stocktakeWeek";
import {
  isPrepVisibleOnStocktake,
  isRawVisibleOnStocktakeForLocation,
} from "@/lib/stocktakeVisibility";
import {
  basePerOneStocktakeInputUnit,
  packSizeToBaseAmount,
  stocktakeOrderUnitLabel,
} from "@/lib/stocktakeRawPackMath";

type DeliverySchedule = { supplier_id: string; day_of_week: number };
type DispatchStatus = {
  loading: boolean;
  loadingAction?: "dry_run" | "send";
  dryRun?: boolean;
  message?: string;
  error?: string;
};

type SuggestionOrderKind = "pack" | "stocktake" | "recipe";

type OrderLine = {
  raw_ingredient_id: string;
  raw_ingredient_name: string;
  pack_size_id: string | null;
  pack_size_label: string;
  size: number;
  size_unit: string;
  price_cents: number | null;
  quantity: number;
};

function normIngredientName(name: string | null | undefined): string {
  return normRawIngredientName(name);
}


function stockFingerprint(stock: Record<string, number>): string {
  return Object.entries(stock)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, q]) => `${id}:${Math.round(q)}`)
    .join("|");
}

function orderingDraftFingerprint(params: {
  rawStock: Record<string, number>;
  prepStock: Record<string, number>;
  revenueCents: number | null;
}): string {
  return [
    stockFingerprint(params.rawStock),
    stockFingerprint(params.prepStock),
    String(params.revenueCents ?? "none"),
  ].join("||");
}

/** DB/JSON sometimes returns size as string; normalize for comparisons. */
function normalizePackRow(p: IngredientPackSize): IngredientPackSize {
  const s = Number(p.size);
  const m = Number(p.order_pack_multiple);
  const mult = Number.isFinite(m) && m >= 1 ? Math.floor(m) : 1;
  return {
    ...p,
    size: Number.isFinite(s) && s > 0 ? s : 0,
    order_pack_multiple: mult,
  };
}

/** Prefer order-specific packs from master sheet; fall back if only stocktake packs exist. */
function packsForOrder(packs: IngredientPackSize[]): IngredientPackSize[] {
  const o = packs.filter((p) => {
    const pr = (p.pack_purpose || "both").toLowerCase();
    return pr === "order" || pr === "both";
  });
  return o.length > 0 ? o : packs;
}

const RAW_INGREDIENTS_WITH_PACKS_SELECT = `id, name, unit, location_id, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit, order_pack_multiple, ordering_daily_need_multiplier, ordering_min_order_packs, ordering_max_order_base, ordering_min_order_base, stock_par_kind, stock_par_min_amount, stock_par_min_packs, stock_par_order_packs, ingredient_pack_sizes ( id, raw_ingredient_id, size, size_unit, price_cents, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple )`;

type RawWithNestedPacks = RawIngredient & {
  ingredient_pack_sizes?: IngredientPackSize[] | IngredientPackSize | null;
};

async function loadRawIngredientsWithPacks(
  supabase: ReturnType<typeof createClient>,
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

/** Card order: Java bakery → Van Gelder → Bidfood → others (A–Z). */
const SUPPLIER_CARD_PRIORITY = [
  "java bakery",
  "van gelder",
  "bidfood",
  "gédé",
  "gedé",
  "today food group",
  "tuana",
] as const;

function sortSuppliersForOrdering(list: Supplier[]): Supplier[] {
  return [...list].sort((a, b) => {
    const na = a.name.toLowerCase().trim();
    const nb = b.name.toLowerCase().trim();
    const ia = (SUPPLIER_CARD_PRIORITY as readonly string[]).indexOf(na);
    const ib = (SUPPLIER_CARD_PRIORITY as readonly string[]).indexOf(nb);
    const ra = ia === -1 ? 1000 : ia;
    const rb = ib === -1 ? 1000 : ib;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
}

function normSupplierName(name: string): string {
  return name.toLowerCase().trim();
}

/** User-facing dry run result (English UI). */
function formatDryRunSuccessMessage(payload: {
  message?: string;
  channel?: string;
}): string {
  const raw = (payload.message ?? "").trim();
  const detail = raw
    .replace(/^dry run[^—–-]*[—–-]?\s*/i, "")
    .replace(/^(ok\s*(with warnings)?\s*[—–-]\s*)?not sent\.?\s*/i, "")
    .replace(/^niet verstuurd\.?\s*/i, "")
    .replace(/^waarschuwing:\s*/i, "")
    .trim();

  const hasWarnings =
    /overgeslagen|skipped|ontbreekt|missing|warning|mislukt|failed|niet op|not on/i.test(raw) ||
    Boolean(detail);

  const base = hasWarnings
    ? "Dry run OK with warnings — nothing sent to supplier."
    : "Dry run OK — validation passed, nothing sent to supplier.";

  if (!detail) return base;
  return `${base} ${detail}`;
}

function isTodayFoodGroupSupplier(name: string): boolean {
  return normSupplierName(name) === "today food group";
}

function nextDeliveryLabel(
  supplierName: string,
  daysWhenOrderingToday: number,
  ctx: {
    isWeeklyKitchenDay: boolean;
    allowOffScheduleOrdering: boolean;
    weeklyDayLabel: string | null;
  }
): string {
  if (isOnDemandSupplierName(supplierName)) {
    if (!ctx.allowOffScheduleOrdering && !ctx.isWeeklyKitchenDay && ctx.weeklyDayLabel) {
      return `Order on ${ctx.weeklyDayLabel} (weekly stocktake day)`;
    }
    return "No fixed delivery day — order when you need stock";
  }
  if (daysWhenOrderingToday === 1) return "Next delivery: tomorrow";
  return `Next delivery: in ${daysWhenOrderingToday} days`;
}

/** True when you should place/send an order today (delivery is tomorrow). */
function isSupplierOrderDayToday(
  supplierName: string,
  deliveryDaysJs: number[],
  orderingDayAnchor: Date,
  ctx: {
    allowOffScheduleOrdering: boolean;
    locationWeeklyStocktakeDow: number | null;
  }
): boolean {
  if (ctx.allowOffScheduleOrdering) return true;

  const todayDow = getDayOfWeek(orderingDayAnchor);
  const weeklyDow = ctx.locationWeeklyStocktakeDow;
  const isWeeklyKitchenDay =
    weeklyDow != null && weeklyDow >= 0 && weeklyDow <= 6 && todayDow === weeklyDow;

  // Tuana / Today Food Group (no fixed delivery schedule): weekly stocktake day only.
  if (isOnDemandSupplierName(supplierName) || deliveryDaysJs.length === 0) {
    return isWeeklyKitchenDay;
  }

  return isNextCalendarDayDelivery({
    fromDate: orderingDayAnchor,
    deliveryDays: deliveryDaysJs,
  });
}

function formatJsDeliveryDays(deliveryDaysJs: number[]): string {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sorted = [...deliveryDaysJs].sort((a, b) => {
    const ia = a === 0 ? 7 : a;
    const ib = b === 0 ? 7 : b;
    return ia - ib;
  });
  return sorted.map((d) => labels[d]).join(", ");
}

function isWeeklyStocktakeItem(ing: RawIngredient): boolean {
  const sd = ing.stocktake_day_of_week;
  return sd != null && Number(sd) >= 0 && Number(sd) <= 6;
}

function buildOrderLinesFromSuggestion(
  suggestedOrder: Record<string, number>,
  suggestionSupplierByRaw: Record<string, string | null>,
  rawIngredients: RawIngredient[],
  packSizesByIngredient: Record<string, IngredientPackSize[]>,
  orderKindByRaw: Record<string, SuggestionOrderKind>,
  locationId?: string | null,
  baseSuggestedByRaw?: Record<string, number>
): Record<string, OrderLine[]> {
  const next: Record<string, OrderLine[]> = {};
  const useVgMediTub = locationUsesVanGelderMediSaladTub(null, locationId);
  const tomatoId = useVgMediTub
    ? rawIngredients.find((r) => (r.name ?? "").toLowerCase().trim() === "tomato")?.id
    : null;
  for (const [rawId, qty] of Object.entries(suggestedOrder)) {
    if (qty <= 0) continue;
    if (tomatoId && rawId === tomatoId) continue;
    const supplierId = suggestionSupplierByRaw[rawId];
    if (!supplierId) continue;
    const ing = rawIngredients.find((r) => r.id === rawId);
    if (!ing) continue;
    const allPacks = packSizesByIngredient[rawId] ?? [];
    const packs = packsForOrder(allPacks);
    // Same pack picker as the quantity math (page suggestion pipeline) — the
    // price-based getBestPackSize can pick a different pack row than the one
    // the suggested quantity was computed against.
    const best = getOrderPackDeterministic(packs) ?? getBestPackSize(packs);
    const kind = orderKindByRaw[rawId] ?? "pack";

    if (isParsleyRawName(ing.name) && baseSuggestedByRaw?.[rawId] != null) {
      const orderPacks = packsForOrder(allPacks);
      const box4 =
        orderPacks.find((p) => p.size === 4 && p.size_unit === "kg") ??
        orderPacks.find((p) => (p.display_unit_label ?? "").toLowerCase().includes("4")) ??
        getBestPackSize(orderPacks);
      const bag1 =
        orderPacks.find((p) => p.size === 1 && p.size_unit === "kg" && p.id !== box4?.id) ??
        orderPacks.find((p) => p.size === 1 && p.size_unit === "kg");
      const pushLine = (pack: IngredientPackSize | null | undefined, quantity: number) => {
        if (!pack || quantity <= 0) return;
        const line: OrderLine = {
          raw_ingredient_id: rawId,
          raw_ingredient_name: ing.name,
          pack_size_id: pack.id,
          pack_size_label: `${pack.size} ${pack.size_unit}`,
          size: pack.size,
          size_unit: pack.size_unit,
          price_cents: pack.price_cents ?? null,
          quantity,
        };
        if (!next[supplierId]) next[supplierId] = [];
        next[supplierId].push(line);
      };
      for (const row of parsleyOrderLines(baseSuggestedByRaw[rawId])) {
        pushLine(row.packSizeKg === 4 ? box4 : bag1, row.quantity);
      }
      continue;
    }

    if (kind === "stocktake") {
      const stLabel = stocktakeOrderUnitLabel(ing, allPacks);
      const line: OrderLine = {
        raw_ingredient_id: rawId,
        raw_ingredient_name: ing.name,
        pack_size_id: best?.id ?? null,
        pack_size_label: best
          ? `${best.size} ${best.size_unit}`
          : `${stLabel} — stocktake unit (no order pack)`,
        size: best?.size ?? 1,
        size_unit: best?.size_unit ?? ing.unit ?? "",
        price_cents: best?.price_cents ?? null,
        quantity: qty,
      };
      if (!next[supplierId]) next[supplierId] = [];
      next[supplierId].push(line);
      continue;
    }

    if (kind === "recipe") {
      const line: OrderLine = {
        raw_ingredient_id: rawId,
        raw_ingredient_name: ing.name,
        pack_size_id: best?.id ?? null,
        pack_size_label: best
          ? `${best.size} ${best.size_unit}`
          : `Total (${ing.unit || "unit"}) — recipe units, no order pack/stocktake`,
        size: best?.size ?? 1,
        size_unit: best?.size_unit ?? ing.unit ?? "",
        price_cents: best?.price_cents ?? null,
        quantity: qty,
      };
      if (!next[supplierId]) next[supplierId] = [];
      next[supplierId].push(line);
      continue;
    }

    const line: OrderLine = {
      raw_ingredient_id: rawId,
      raw_ingredient_name: ing.name,
      pack_size_id: best?.id ?? null,
      pack_size_label: best ? `${best.size} ${best.size_unit}` : "—",
      size: best?.size ?? 0,
      size_unit: best?.size_unit ?? "",
      price_cents: best?.price_cents ?? null,
      quantity: qty,
    };
    if (!next[supplierId]) next[supplierId] = [];
    next[supplierId].push(line);
  }
  for (const supplierId of Object.keys(next)) {
    next[supplierId] = mergeOrderLines(next[supplierId]);
  }
  return next;
}

function orderLineKey(line: OrderLine): string {
  return `${line.raw_ingredient_id}:${line.pack_size_id ?? "none"}`;
}

/** Merge duplicate lines (same raw + pack) by summing quantities. */
function mergeOrderLines(lines: OrderLine[]): OrderLine[] {
  const byKey = new Map<string, OrderLine>();
  const mergedKeys: string[] = [];

  for (const line of lines) {
    const key = orderLineKey(line);
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, { ...prev, quantity: prev.quantity + line.quantity });
    } else {
      byKey.set(key, { ...line });
      mergedKeys.push(key);
    }
  }

  return mergedKeys.map((key) => byKey.get(key)!).filter(Boolean);
}

function mergeOrderLinesBySupplier(
  bySupplier: Record<string, OrderLine[]>
): Record<string, OrderLine[]> {
  const out: Record<string, OrderLine[]> = {};
  for (const [supplierId, lines] of Object.entries(bySupplier)) {
    out[supplierId] = mergeOrderLines(lines);
  }
  return out;
}

/** Total need in “human” mass/volume (kg, L) or count (pcs) for the totals column. */
function formatBaseNeedAsLabel(baseAmt: number, rawUnit: string): string {
  const u = (rawUnit || "").toLowerCase().trim();
  if (u === "g") {
    return `${formatOrderAmount(baseAmt / 1000)}kg`;
  }
  if (u === "kg" || u === "kilogram" || u === "kilograms") {
    return `${formatOrderAmount(baseAmt)}kg`;
  }
  if (u === "ml") {
    return `${formatOrderAmount(baseAmt / 1000)}L`;
  }
  if (u === "l" || u === "liter" || u === "litre") {
    return `${formatOrderAmount(baseAmt)}L`;
  }
  if (u === "pcs" || u === "piece" || u === "pieces") {
    return `${formatOrderAmount(baseAmt)} pcs`;
  }
  return `${formatOrderAmount(baseAmt)} ${rawUnit}`.trim();
}

/** One row: product | N x | pack description | total (kg / L / pcs). */
function orderLineRowView(
  line: OrderLine,
  kind: SuggestionOrderKind,
  ing: RawIngredient | undefined,
  allPacks: IngredientPackSize[]
): {
  product: string;
  countTimes: string;
  packType: string;
  totalLabel: string;
} {
  const product = line.raw_ingredient_name;
  if (!ing) {
    return {
      product,
      countTimes: `${formatOrderAmount(line.quantity)} x`,
      packType: "—",
      totalLabel: formatOrderAmount(line.quantity),
    };
  }

  const forOrder = packsForOrder(allPacks);
  const packForLine =
    line.pack_size_id != null
      ? allPacks.find((p) => p.id === line.pack_size_id) ?? null
      : null;
  const bestPack =
    kind === "pack"
      ? packForLine ??
        getOrderPackDeterministic(forOrder) ?? getBestPackSize(forOrder) ??
        (allPacks.length > 0 ? getOrderPackDeterministic(allPacks) ?? getBestPackSize(allPacks) : null)
      : null;

  if (kind === "pack" && bestPack) {
    const basePer = packSizeToBaseAmount(bestPack, ing.unit);
    const n = Math.max(0, Math.round(line.quantity));
    if (basePer != null && basePer > 0) {
      const totalBase = n * basePer;
      const packType =
        bestPack.display_unit_label?.trim() ||
        `${bestPack.size} ${bestPack.size_unit}`.replace(/\s+/g, " ").trim();
      return {
        product,
        countTimes: `${n} x`,
        packType,
        totalLabel: formatBaseNeedAsLabel(totalBase, ing.unit),
      };
    }
  }

  if (kind === "stocktake") {
    const bps = basePerOneStocktakeInputUnit(ing, allPacks);
    const n = Math.max(0, Math.round(line.quantity));
    if (bps != null && bps > 0) {
      const totalBase = n * bps;
      return {
        product,
        countTimes: `${n} x`,
        packType: stocktakeOrderUnitLabel(ing, allPacks),
        totalLabel: formatBaseNeedAsLabel(totalBase, ing.unit),
      };
    }
  }

  if (kind === "recipe") {
    const n = Math.max(0, Math.round(line.quantity));
    return {
      product,
      countTimes: `${n} x`,
      packType: `${(ing.unit || "unit").toUpperCase()} (recipe)`,
      totalLabel: formatBaseNeedAsLabel(n, ing.unit),
    };
  }

  return {
    product,
    countTimes: `${formatOrderAmount(line.quantity)} x`,
    packType: "—",
    totalLabel: formatBaseNeedAsLabel(line.quantity, ing.unit),
  };
}

export default function OrderingPage() {
  const pathname = usePathname();
  const { locationId, locationOptions, locations } = useLocation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [schedules, setSchedules] = useState<DeliverySchedule[]>([]);
  const [rawIngredients, setRawIngredients] = useState<RawIngredient[]>([]);
  const [packSizes, setPackSizes] = useState<IngredientPackSize[]>([]);
  /** Packs loaded in a follow-up query when nested raw→packs omits rows PostgREST caps. */
  const [supplementalPackSizes, setSupplementalPackSizes] = useState<IngredientPackSize[]>([]);
  const [manualOrderOverrides, setManualOrderOverrides] = useState<Record<
    string,
    OrderLine[]
  > | null>(null);
  /** Per-locatie ordering overrides geladen vanuit raw_ingredient_location_ordering. */
  const [locationOrderingByRawId, setLocationOrderingByRawId] = useState<Record<string, RawIngredientLocationOrdering>>({});
  /** True als een opgeslagen concept is hersteld bij het laden. */
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True while a debounced draft save is scheduled but has not fired yet. */
  const draftSavePendingRef = useRef(false);
  /** Latest location + overrides, read by the unmount flush below. */
  const draftLatestRef = useRef<{ locationId: string | null; overrides: Record<string, OrderLine[]> | null }>({
    locationId: null,
    overrides: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dispatchStatusBySupplier, setDispatchStatusBySupplier] = useState<Record<string, DispatchStatus>>({});
  const [suggestionRefreshToken, setSuggestionRefreshToken] = useState(0);
  /** Calendar date for stock counts and suggestions (today or a past day for review). */
  const [viewDate, setViewDate] = useState(() => localCalendarDateString());
  const todayDateStr = useMemo(() => localCalendarDateString(), [suggestionRefreshToken]);
  const isHistoricalView = viewDate < todayDateStr;
  const [suggestedOrder, setSuggestedOrder] = useState<Record<string, number>>({});
  /** Base-unit order need per raw (for parsley 4kg + 1kg split lines). */
  const [baseSuggestedByRaw, setBaseSuggestedByRaw] = useState<Record<string, number>>({});
  /** Preferred supplier per raw for the current suggestion. */
  const [suggestionSupplierByRaw, setSuggestionSupplierByRaw] = useState<Record<string, string | null>>({});
  /** Per raw: pack / stocktake / recipe units when there is no order pack line. */
  const [suggestionOrderKindByRaw, setSuggestionOrderKindByRaw] = useState<
    Record<string, SuggestionOrderKind>
  >({});
  const [suggestedUnassignedRawIds, setSuggestedUnassignedRawIds] = useState<string[]>([]);
  /** Medi salad daily prep count for Pijp/Zuidas VG tub swap (from location_prep_items). */
  const [mediSaladNeedPrep, setMediSaladNeedPrep] = useState(0);
  const [currentRawStockById, setCurrentRawStockById] = useState<Record<string, number>>({});
  const [currentPrepStockById, setCurrentPrepStockById] = useState<Record<string, number>>({});
  const [revenueTargetCentsForDraft, setRevenueTargetCentsForDraft] = useState<number | null>(null);
  const [supplierRawIdsBySupplier, setSupplierRawIdsBySupplier] = useState<Record<string, string[]>>({});
  const [newRawBySupplier, setNewRawBySupplier] = useState<Record<string, string>>({});
  /** Set when suggestion queries fail (RLS/network) so the page is not silently empty. */
  const [suggestionLoadError, setSuggestionLoadError] = useState<string | null>(null);
  const [suggestionRefreshing, setSuggestionRefreshing] = useState(false);
  const [recalculateFeedback, setRecalculateFeedback] = useState<string | null>(null);
  const recalculateRequestedRef = useRef(false);
  /** Planning-only supplier cards (not an order day) start collapsed. */
  const [expandedPlanningSupplierIds, setExpandedPlanningSupplierIds] = useState<Set<string>>(
    () => new Set()
  );
  const [planningSectionExpanded, setPlanningSectionExpanded] = useState(false);
  const [allowOffScheduleOrdering, setAllowOffScheduleOrdering] = useState(false);
  /** Why the suggestion is empty / what was loaded (local date + counts). */
  /** Same rule as Dashboard: every location prep row has a count row for today (local date). */
  const [prepStocktakeComplete, setPrepStocktakeComplete] = useState(false);
  const [workflowStocktakeComplete, setWorkflowStocktakeComplete] = useState(false);
  /** Same prep-based soak total as prep list (local calendar date). */
  const [soakDryChickpeasKg, setSoakDryChickpeasKg] = useState(0);
  const [suggestionInsight, setSuggestionInsight] = useState<{
    dateUsed: string;
    prepLinkedCount: number;
    recipeRowsForLocation: number;
    dailyRawNeedSum: number;
    baseOrderNeedSum: number;
    /** Total suggestion lines (packs + base-unit fallback rows). */
    suggestionLineCount: number;
    /** Rows loaded from ingredient_pack_sizes for suggested raws (authoritative query). */
    packRowsLoadedFromDb: number;
    /** Set when chunked pack queries fail (e.g. network). */
    packFetchError: string | null;
    /** Raw ingredients for this location (client); if 0 the pack query may be wrong. */
    locationRawCount: number;
    stockRowsForDate: number;
    revenueCoverDates: string[];
    revenueEveningDate: string;
    /** Lines after conversion to order packs (can be 0 while need &gt; 0). */
    packConversionLineCount: number;
    /** Lines without order packs: stocktake and/or recipe units. */
    baseFallbackLineCount: number;
    /** Recipe raw names from other locations that could not be matched here. */
    unmatchedRecipeNames: string[];
  } | null>(null);

  const orderBySupplierRef = useRef<Record<string, OrderLine[]>>({});

  const suggestionRevisionKey = useMemo(
    () =>
      orderingDraftFingerprint({
        rawStock: currentRawStockById,
        prepStock: currentPrepStockById,
        revenueCents: revenueTargetCentsForDraft,
      }) +
      "|s:" +
      JSON.stringify(suggestedOrder) +
      "|k:" +
      JSON.stringify(suggestionOrderKindByRaw) +
      "|sup:" +
      JSON.stringify(suggestionSupplierByRaw),
    [
      currentRawStockById,
      currentPrepStockById,
      revenueTargetCentsForDraft,
      suggestedOrder,
      suggestionOrderKindByRaw,
      suggestionSupplierByRaw,
    ]
  );

  useEffect(() => {
    // A restored draft must survive the suggestion settling on load / tab
    // navigation. Without this guard the key changes as stock + suggestion data
    // arrive after the restore, wiping the user's saved edits (e.g. a removed
    // line) so the auto-suggestion reappears. Explicit "Recalculate from
    // stocktake" is the way to refresh from the latest counts.
    if (draftRestored) return;
    setManualOrderOverrides(null);
    setDraftRestored(false);
  }, [suggestionRevisionKey, draftRestored]);

  /** Drop legacy browser drafts — order list is always derived from live stock + suggestion. */
  useEffect(() => {
    if (!locationId) return;
    try {
      const prefix = `mima-ordering-draft:${locationId}:`;
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  }, [locationId]);

  // Keep the latest location + overrides available to the unmount flush.
  draftLatestRef.current = { locationId, overrides: manualOrderOverrides };

  const writeOrderDraft = (loc: string, overrides: Record<string, OrderLine[]>) => {
    const supabase = createClient();
    void supabase
      .from("order_drafts")
      .upsert(
        { location_id: loc, date: localCalendarDateString(), overrides, updated_at: new Date().toISOString() },
        { onConflict: "location_id,date" }
      )
      .then(({ error }) => {
        // Surface failures instead of failing silently (e.g. RLS denial).
        if (error) {
          console.error("order_drafts upsert failed:", error.message);
          setDraftSaveFailed(true);
        } else {
          setDraftSaveFailed(false);
        }
      });
  };

  /** Debounced upsert van het bestel-concept naar order_drafts. */
  useEffect(() => {
    if (!locationId) return;
    // Only persist once there are real manual edits. While null (initial load /
    // pre-restore) writing {} would clobber a draft we are about to restore.
    if (manualOrderOverrides == null) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSavePendingRef.current = true;
    const loc = locationId;
    const overrides = manualOrderOverrides;
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      draftSavePendingRef.current = false;
      writeOrderDraft(loc, overrides);
    }, 1200);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [locationId, manualOrderOverrides]);

  // Flush a still-pending draft save when leaving the page, so an edit made just
  // before navigating away (e.g. remove a line, then switch to another tab) is
  // persisted instead of being dropped when the debounce timer is cleared.
  useEffect(() => {
    return () => {
      if (!draftSavePendingRef.current) return;
      draftSavePendingRef.current = false;
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      const { locationId: loc, overrides } = draftLatestRef.current;
      if (loc && overrides != null) writeOrderDraft(loc, overrides);
    };
  }, []);

  useEffect(() => {
    if (!locationId) {
      setSuppliers([]);
      setSchedules([]);
      setRawIngredients([]);
      setPackSizes([]);
      setSupplementalPackSizes([]);
      setManualOrderOverrides(null);
      setLocationOrderingByRawId({});
      setSuggestionOrderKindByRaw({});
      setCurrentRawStockById({});
      setCurrentPrepStockById({});
      setRevenueTargetCentsForDraft(null);
      setSupplierRawIdsBySupplier({});
      setNewRawBySupplier({});
      setPrepStocktakeComplete(false);
      setWorkflowStocktakeComplete(false);
      setDraftRestored(false);
      setLoading(false);
      return;
    }
    setManualOrderOverrides(null);
    setSupplementalPackSizes([]);
    setDraftRestored(false);
    setLoading(true);
    const supabase = createClient();

    // Embed packs on each raw row (avoids .in() limits / default row caps on a separate query).
    Promise.all([
      supabase.from("suppliers").select("id, name, location_id").eq("location_id", locationId).order("name"),
      supabase.from("supplier_delivery_schedules").select("supplier_id, day_of_week").eq("location_id", locationId),
      supabase
        .from("raw_ingredients")
        .select(
          `id, name, unit, location_id, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit, order_pack_multiple, ordering_daily_need_multiplier, ordering_min_order_packs, ordering_max_order_base, ordering_min_order_base, stock_par_kind, stock_par_min_amount, stock_par_min_packs, stock_par_order_packs, ingredient_pack_sizes ( id, raw_ingredient_id, size, size_unit, price_cents, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple )`
        )
        .eq("location_id", locationId)
        .order("name"),
      supabase
        .from("raw_ingredient_location_ordering")
        .select("id, raw_ingredient_id, location_id, daily_need_multiplier, standing_order_packs")
        .eq("location_id", locationId),
    ])
      .then(async ([sRes, schRes, rRes, loRes]) => {
        if (sRes.error) throw sRes.error;
        if (schRes.error) throw schRes.error;
        if (rRes.error) throw rRes.error;

        type RawWithPacks = RawIngredient & {
          ingredient_pack_sizes?: IngredientPackSize[] | IngredientPackSize | null;
        };
        const rawRows = (rRes.data as RawWithPacks[]) ?? [];
        const rawList: RawIngredient[] = [];
        const packList: IngredientPackSize[] = [];
        for (const row of rawRows) {
          const { ingredient_pack_sizes: nested, ...ing } = row;
          rawList.push(ing);
          const list = Array.isArray(nested) ? nested : nested != null ? [nested] : [];
          for (const p of list) packList.push(p);
        }

        /** Nested `ingredient_pack_sizes` is often incomplete for large catalogs (PostgREST embed limits). */
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

        // Build location ordering overrides map.
        const locOrderingRows = (loRes.data as RawIngredientLocationOrdering[]) ?? [];
        const locOrderingMap: Record<string, RawIngredientLocationOrdering> = {};
        for (const row of locOrderingRows) locOrderingMap[row.raw_ingredient_id] = row;

        // Restore today's draft if it exists (date-keyed, so stale drafts are ignored).
        const todayStr = localCalendarDateString();
        const draftRes = await supabase
          .from("order_drafts")
          .select("overrides, date")
          .eq("location_id", locationId)
          .eq("date", todayStr)
          .maybeSingle();
        const savedDraft = draftRes.data?.overrides as Record<string, OrderLine[]> | null | undefined;

        setSuppliers((sRes.data as Supplier[]) ?? []);
        setSchedules((schRes.data as DeliverySchedule[]) ?? []);
        setRawIngredients(rawList);
        setPackSizes(Array.from(dedupe.values()));
        setLocationOrderingByRawId(locOrderingMap);
        if (savedDraft && typeof savedDraft === "object" && Object.keys(savedDraft).length > 0) {
          setManualOrderOverrides(savedDraft);
          setDraftRestored(true);
        }
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setSuppliers([]);
        setSchedules([]);
        setRawIngredients([]);
        setPackSizes([]);
        setLocationOrderingByRawId({});
      })
      .finally(() => setLoading(false));
  }, [locationId]);

  // Load prep-based suggestion: daily need × cover until delivery *after* the next one (+ evening) − stock → packs
  useEffect(() => {
    const rawsMatchLocation =
      rawIngredients.length > 0 &&
      rawIngredients.every((r) => r.location_id === locationId);
    if (!locationId || !rawsMatchLocation) {
      setPrepStocktakeComplete(false);
      setSuggestedOrder({});
      setBaseSuggestedByRaw({});
      setSuggestionSupplierByRaw({});
      setSuggestionOrderKindByRaw({});
      setSuggestedUnassignedRawIds([]);
      setMediSaladNeedPrep(0);
      setSuggestionLoadError(null);
      setSuggestionInsight(null);
      setSupplementalPackSizes([]);
      return;
    }
    const d = viewDate;
    const requestLocationId = locationId;
    const rawsForRequest = rawIngredients.filter((r) =>
      isRawVisibleOnStocktakeForLocation(r, locationId)
    );
    const rawIds = new Set(rawsForRequest.map((r) => r.id));
    const rawIdList = Array.from(rawIds);
    const supabase = createClient();
    const todayForCover = new Date(`${d}T12:00:00`);
    const [stockWindowY, stockWindowM, stockWindowD] = d.split("-").map(Number);
    const stockWindowStartDate = new Date(stockWindowY, stockWindowM - 1, stockWindowD);
    stockWindowStartDate.setDate(stockWindowStartDate.getDate() - 7);
    const stockWindowStart = localCalendarDateString(stockWindowStartDate);

    /** Avoids setState / pack fetch after unmount or React Strict Mode re-run (stale async). */
    let alive = true;
    setSuggestionRefreshing(true);
    void (async () => {
      const finishRecalculateWithError = (message: string) => {
        if (!recalculateRequestedRef.current) return;
        recalculateRequestedRef.current = false;
        setRecalculateFeedback(message);
      };
      try {
      const lpiRes = await supabase
        .from("location_prep_items")
        .select(
          "prep_item_id, base_quantity, prep_items(id, name, content_amount, content_unit, recipe_output_amount, recipe_output_unit, ingredient_qty_is_per_recipe_batch, stocktake_visible, batch_size)"
        )
        .eq("location_id", locationId);
      if (!alive) return;
      if (lpiRes.error) {
        setPrepStocktakeComplete(false);
        setSuggestedOrder({});
      setBaseSuggestedByRaw({});
        setSuggestionSupplierByRaw({});
        setSuggestionOrderKindByRaw({});
        setSuggestedUnassignedRawIds([]);
        setSupplementalPackSizes([]);
        setSuggestionLoadError(String(lpiRes.error.message));
        setSuggestionInsight(null);
        finishRecalculateWithError(`Could not refresh from stocktake: ${lpiRes.error.message}`);
        return;
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
      if (!alive) return;

      const countedPrepForDate =
        prepCountRes.error != null ? 0 : (prepCountRes.count ?? 0);
      const prepComplete = lpi.length > 0 && countedPrepForDate >= lpi.length;
      setPrepStocktakeComplete(prepComplete);

      const err =
        locRes.error ||
        recipeRes.error ||
        stockRes.error ||
        supRes.error ||
        siRes.error ||
        prepQtyRes.error;
      if (err) {
        setPrepStocktakeComplete(false);
        setSuggestedOrder({});
      setBaseSuggestedByRaw({});
        setSuggestionSupplierByRaw({});
        setSuggestionOrderKindByRaw({});
        setSuggestedUnassignedRawIds([]);
        setSupplementalPackSizes([]);
        setSuggestionLoadError(
          typeof err === "object" && err && "message" in err
            ? String((err as { message?: string }).message)
            : "Could not load order suggestion."
        );
        setSuggestionInsight(null);
        finishRecalculateWithError(
          typeof err === "object" && err && "message" in err
            ? `Could not refresh from stocktake: ${String((err as { message?: string }).message)}`
            : "Could not refresh from stocktake. Check your connection and try again."
        );
        return;
      }
      setSuggestionLoadError(null);

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
      setCurrentRawStockById(currentStock);
      setCurrentPrepStockById(prepStockByPrepItemId);
      setRevenueTargetCentsForDraft(revCents);

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
      setSupplierRawIdsBySupplier(supplierRawIds);
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
        baseSuggested: applyWholewheatPitaMinBox({
          ...pitaStock,
          rawIngredients,
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
        }),
      });
      const baseRawIds = Object.keys(baseSuggested);
      /**
       * Load packs via raw_ingredients → nested ingredient_pack_sizes (same pattern as initial page load).
       * Direct queries on ingredient_pack_sizes with .in() can return 0 rows in some PostgREST/URL cases.
       */
      const packLoadErrors: string[] = [];
      let supplementalPacks: IngredientPackSize[] = [];
      if (!alive) return;
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
      if (rawIdList.length > 0 && alive) {
        const packChunk = 100;
        for (let i = 0; i < rawIdList.length; i += packChunk) {
          if (!alive) return;
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
      let suggestedForUi: Record<string, number> = { ...drinkPackCleanup.suggestedPacks };
      let kindForUi: Record<string, SuggestionOrderKind> = {
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
      if (!alive || requestLocationId !== locationId) return;
      setSupplementalPackSizes(supplementalPacks);
      setMediSaladNeedPrep(mediSaladNeedPrep);
      setBaseSuggestedByRaw(baseSuggested);
      setSuggestedOrder(suggestedForUi);
      setSuggestionOrderKindByRaw(kindForUi);
      setSuggestionSupplierByRaw(preferredSupplierByRawId);
      setSuggestedUnassignedRawIds(unassigned);
      setSuggestionInsight({
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
      });
      if (recalculateRequestedRef.current) {
        recalculateRequestedRef.current = false;
        setRecalculateFeedback(
          suggestionLineCount > 0
            ? `Refreshed from stocktake for ${d}: ${suggestionLineCount} suggested line${suggestionLineCount === 1 ? "" : "s"} (${stockListToday.length} raw count${stockListToday.length === 1 ? "" : "s"} today).`
            : `Refreshed from stocktake for ${d}. No order lines suggested (${stockListToday.length} raw count${stockListToday.length === 1 ? "" : "s"} today).`
        );
      }
      } finally {
        if (alive) setSuggestionRefreshing(false);
      }
    })().catch(() => {
      if (!alive) return;
      setPrepStocktakeComplete(false);
      setSuggestedOrder({});
      setBaseSuggestedByRaw({});
      setSuggestionSupplierByRaw({});
      setSuggestionOrderKindByRaw({});
      setSuggestedUnassignedRawIds([]);
      setCurrentRawStockById({});
      setCurrentPrepStockById({});
      setRevenueTargetCentsForDraft(null);
      setSupplementalPackSizes([]);
      setMediSaladNeedPrep(0);
      setSuggestionLoadError("Could not load order suggestion.");
      setSuggestionInsight(null);
      recalculateRequestedRef.current = false;
      setRecalculateFeedback("Could not refresh from stocktake. Check your connection and try again.");
      setSuggestionRefreshing(false);
    });

    return () => {
      alive = false;
    };
  }, [locationId, locationOptions, rawIngredients, schedules, packSizes, suppliers, suggestionRefreshToken, viewDate, locationOrderingByRawId]);

  useEffect(() => {
    if (isHistoricalView) return;
    const triggerRefresh = () => setSuggestionRefreshToken((v) => v + 1);
    const onVisibility = () => {
      if (document.visibilityState === "visible") triggerRefresh();
    };
    window.addEventListener("focus", triggerRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", triggerRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isHistoricalView]);

  /** Refresh suggestion when returning to Ordering. */
  useEffect(() => {
    if (pathname !== "/ordering" || !locationId) return;
    setSuggestionRefreshToken((v) => v + 1);
  }, [pathname, locationId]);

  useEffect(() => {
    if (!locationId) {
      setWorkflowStocktakeComplete(false);
      return;
    }

    let alive = true;
    const d = localCalendarDateString();
    const supabase = createClient();

    void (async () => {
      try {
        const [lpiRes, prepCountRes, rawRes, stockRes, schRes, supRes, siRes, locRes] =
          await Promise.all([
            supabase
              .from("location_prep_items")
              .select("prep_item_id, prep_items(stocktake_visible)")
              .eq("location_id", locationId)
              .limit(10000),
            supabase
              .from("daily_prep_counts")
              .select("prep_item_id")
              .eq("location_id", locationId)
              .eq("date", d)
              .limit(10000),
            supabase
              .from("raw_ingredients")
              .select("id, stocktake_visible, stocktake_day_of_week")
              .eq("location_id", locationId)
              .limit(10000),
            supabase
              .from("daily_stock_counts")
              .select("raw_ingredient_id")
              .eq("location_id", locationId)
              .eq("date", d)
              .limit(10000),
            supabase
              .from("supplier_delivery_schedules")
              .select("supplier_id, day_of_week")
              .eq("location_id", locationId),
            supabase.from("suppliers").select("id").eq("location_id", locationId),
            supabase.from("supplier_ingredients").select("supplier_id, raw_ingredient_id, is_preferred").limit(10000),
            supabase
              .from("locations")
              .select("weekly_stocktake_day_of_week")
              .eq("id", locationId)
              .single(),
          ]);

        if (!alive) return;
        const err =
          lpiRes.error ||
          prepCountRes.error ||
          rawRes.error ||
          stockRes.error ||
          schRes.error ||
          supRes.error ||
          siRes.error ||
          locRes.error;
        if (err) {
          setWorkflowStocktakeComplete(false);
          return;
        }

        const prepIds = new Set(
          (
            (lpiRes.data as unknown as {
              prep_item_id: string;
              prep_items: PrepItem | PrepItem[] | null;
            }[]) ?? []
          )
            .filter((r) => {
              const prep = Array.isArray(r.prep_items) ? r.prep_items[0] : r.prep_items;
              return isPrepVisibleOnStocktake(prep);
            })
            .map((r) => r.prep_item_id)
        );
        const countedPrepIds = new Set(
          ((prepCountRes.data as { prep_item_id: string }[]) ?? []).map((r) => r.prep_item_id)
        );
        const prepOk =
          prepIds.size === 0 || [...prepIds].every((id) => countedPrepIds.has(id));

        const visibleRaws = (((rawRes.data as RawIngredient[]) ?? [])).filter((ing) =>
          isRawVisibleOnStocktakeForLocation(ing, locationId)
        );
        const locationSupplierIds = new Set(
          ((supRes.data as { id: string }[]) ?? []).map((s) => s.id)
        );
        const schedulesBySupplierJs: Record<string, number[]> = {};
        for (const s of (schRes.data as DeliverySchedule[]) ?? []) {
          if (!schedulesBySupplierJs[s.supplier_id]) schedulesBySupplierJs[s.supplier_id] = [];
          schedulesBySupplierJs[s.supplier_id].push(supplierScheduleDayToJsDay(s.day_of_week));
        }
        const linksByRaw: Record<string, { supplier_id: string; is_preferred: boolean }[]> = {};
        for (const link of
          ((siRes.data as { supplier_id: string; raw_ingredient_id: string; is_preferred: boolean }[]) ??
            [])) {
          if (!locationSupplierIds.has(link.supplier_id)) continue;
          if (!linksByRaw[link.raw_ingredient_id]) linksByRaw[link.raw_ingredient_id] = [];
          linksByRaw[link.raw_ingredient_id].push(link);
        }
        const preferredSupplierByRawId: Record<string, string | null> = {};
        for (const raw of visibleRaws) {
          const links = linksByRaw[raw.id] ?? [];
          preferredSupplierByRawId[raw.id] =
            links.find((l) => l.is_preferred)?.supplier_id ?? links[0]?.supplier_id ?? null;
        }

        const locationWeeklyDow =
          (locRes.data as { weekly_stocktake_day_of_week?: number | null } | null)
            ?.weekly_stocktake_day_of_week ?? null;
        const requiredRaws = visibleRaws.filter((raw) => {
          if (isWeeklyStocktakeItem(raw)) {
            return isWeeklyStocktakeDueOnDate({
              dateStr: d,
              locationWeeklyDow,
              ingredientWeeklyDow: raw.stocktake_day_of_week,
            });
          }
          return isRawDeliverableTomorrow({
            stocktakeDate: d,
            rawId: raw.id,
            preferredSupplierByRawId,
            schedulesBySupplierJs,
          });
        });
        const countedRawIds = new Set(
          ((stockRes.data as { raw_ingredient_id: string }[]) ?? []).map((r) => r.raw_ingredient_id)
        );
        const rawOk =
          requiredRaws.length === 0 || requiredRaws.every((raw) => countedRawIds.has(raw.id));

        setWorkflowStocktakeComplete(prepOk && rawOk);
      } catch {
        if (alive) setWorkflowStocktakeComplete(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [locationId, suggestionRefreshToken]);

  const schedulesBySupplier = useMemo(() => {
    const m: Record<string, number[]> = {};
    for (const s of schedules) {
      if (!m[s.supplier_id]) m[s.supplier_id] = [];
      m[s.supplier_id].push(supplierScheduleDayToJsDay(s.day_of_week));
    }
    return m;
  }, [schedules]);

  useEffect(() => {
    if (!locationId) {
      setSoakDryChickpeasKg(0);
      return;
    }
    let alive = true;
    const d = localCalendarDateString();
    const supabase = createClient();
    void (async () => {
      const revCents = await ensureEffectiveDailyRevenueTargetCents(supabase, locationId, d);
      const [lpiRes, countRes, locRes] = await Promise.all([
        supabase
          .from("location_prep_items")
          .select("prep_item_id, base_quantity, display_order, prep_items(*)")
          .eq("location_id", locationId)
          .order("display_order")
          .order("prep_item_id"),
        supabase
          .from("daily_prep_counts")
          .select("prep_item_id, quantity")
          .eq("location_id", locationId)
          .eq("date", d),
        supabase.from("locations").select("full_capacity_revenue").eq("id", locationId).single(),
      ]);
      if (!alive) return;
      if (lpiRes.error || countRes.error) {
        setSoakDryChickpeasKg(0);
        return;
      }
      const raw =
        (lpiRes.data as unknown as {
          prep_item_id: string;
          base_quantity?: number | null;
          display_order?: number | null;
          prep_items: PrepItem | PrepItem[] | null;
        }[]) ?? [];
      const locationPrepItems = raw.map((row) => ({
        prep_item_id: row.prep_item_id,
        base_quantity: row.base_quantity,
        display_order: row.display_order,
        prep_items: Array.isArray(row.prep_items) ? row.prep_items[0] ?? null : row.prep_items,
      }));
      const countsList = (countRes.data as { prep_item_id: string; quantity: number }[]) ?? [];
      const todayCounts = Object.fromEntries(countsList.map((c) => [c.prep_item_id, Number(c.quantity)]));
      const loc = locRes.data as { full_capacity_revenue?: number | null } | null;
      const revenueMultiplier = getRevenueMultiplier({
        todayRevenueCents: revCents,
        fullCapacityRevenue: loc?.full_capacity_revenue ?? null,
      });
      setSoakDryChickpeasKg(
        soakDryChickpeasKgFromPrepState({
          locationPrepItems,
          todayCounts,
          revenueMultiplier,
        })
      );
    })();
    return () => {
      alive = false;
    };
  }, [locationId]);

  useEffect(() => {
    if (!locationId) return;
    const runFlushIfNeeded = async () => {
      const hour = new Date().getHours();
      if (hour < 18) return;
      try {
        const supabase = createClient();
        await supabase.functions.invoke("dispatch-order", {
          body: { action: "flush_java_queue" },
        });
      } catch {
        // keep UI responsive; queue flush can retry on next interval
      }
    };
    void runFlushIfNeeded();
    const timer = setInterval(() => {
      void runFlushIfNeeded();
    }, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [locationId]);

  const orderingDayAnchor = useMemo(
    () => new Date(`${viewDate}T12:00:00`),
    [viewDate]
  );

  const locationWeeklyStocktakeDow = useMemo(() => {
    const dow = locations.find((l) => l.id === locationId)?.weekly_stocktake_day_of_week;
    return dow != null && dow >= 0 && dow <= 6 ? dow : null;
  }, [locations, locationId]);

  const isWeeklyKitchenDay = useMemo(() => {
    if (locationWeeklyStocktakeDow == null) return false;
    return getDayOfWeek(orderingDayAnchor) === locationWeeklyStocktakeDow;
  }, [locationWeeklyStocktakeDow, orderingDayAnchor]);

  const weeklyDayLabel = useMemo(
    () =>
      locationWeeklyStocktakeDow != null ? JS_WEEKDAY_LABELS[locationWeeklyStocktakeDow] : null,
    [locationWeeklyStocktakeDow]
  );

  const orderDayContext = useMemo(
    () => ({
      allowOffScheduleOrdering,
      locationWeeklyStocktakeDow,
    }),
    [allowOffScheduleOrdering, locationWeeklyStocktakeDow]
  );

  const deliveryLabelContext = useMemo(
    () => ({
      isWeeklyKitchenDay,
      allowOffScheduleOrdering,
      weeklyDayLabel,
    }),
    [isWeeklyKitchenDay, allowOffScheduleOrdering, weeklyDayLabel]
  );

  const daysUntilDeliveryIfOrderingToday = (supplierId: string) =>
    daysUntilDeliveryWhenOrderingToday({
      today: orderingDayAnchor,
      deliveryDays: schedulesBySupplier[supplierId] ?? [],
    });

  const sortedSuppliers = useMemo(() => sortSuppliersForOrdering(suppliers), [suppliers]);

  const packSizesByIngredient = useMemo(() => {
    const m: Record<string, IngredientPackSize[]> = {};
    for (const p of [...packSizes, ...supplementalPackSizes]) {
      if (!m[p.raw_ingredient_id]) m[p.raw_ingredient_id] = [];
      if (!m[p.raw_ingredient_id].some((x) => x.id === p.id)) {
        m[p.raw_ingredient_id].push(p);
      }
    }
    return m;
  }, [packSizes, supplementalPackSizes]);

  /** Order lines derived directly from the latest suggestion (no stale state / session cache). */
  const autoOrderBySupplier = useMemo(() => {
    if (!locationId || rawIngredients.length === 0) return {};
    if (Object.keys(suggestedOrder).length === 0) return {};
    const hasAssignable = Object.entries(suggestedOrder).some(
      ([rid, q]) => q > 0 && suggestionSupplierByRaw[rid]
    );
    if (!hasAssignable) return {};
    const locationName = locationOptions.find((l) => l.id === locationId)?.name ?? "";
    const packCleanup = applyMediSaladSuggestedPacksCleanup({
      locationId,
      locationName,
      suggestedPacks: suggestedOrder,
      kindByRaw: suggestionOrderKindByRaw,
      rawIngredients,
      mediSaladNeedPrep,
    });
    return buildOrderLinesFromSuggestion(
      packCleanup.suggestedPacks,
      suggestionSupplierByRaw,
      rawIngredients,
      packSizesByIngredient,
      packCleanup.kindByRaw as Record<string, SuggestionOrderKind>,
      locationId,
      baseSuggestedByRaw
    );
  }, [
    locationId,
    locationOptions,
    suggestedOrder,
    suggestionSupplierByRaw,
    suggestionOrderKindByRaw,
    rawIngredients,
    packSizesByIngredient,
    mediSaladNeedPrep,
    baseSuggestedByRaw,
  ]);

  const autoOrderBySupplierRef = useRef(autoOrderBySupplier);
  autoOrderBySupplierRef.current = autoOrderBySupplier;

  const orderBySupplier = manualOrderOverrides ?? autoOrderBySupplier;
  orderBySupplierRef.current = orderBySupplier;

  const tahiniBucketsLeft = useMemo(() => {
    const tahini = rawIngredients.find((r) =>
      (r.name ?? "").toLowerCase().trim().includes("tahini")
    );
    if (!tahini) return null;
    const stockBase = Number(currentRawStockById[tahini.id] ?? 0);
    if (!Number.isFinite(stockBase) || stockBase < 0) return null;
    const packs = [...(packSizesByIngredient[tahini.id] ?? [])];
    const basePerBucket = basePerOneStocktakeInputUnit(tahini, packs);
    if (basePerBucket != null && Number.isFinite(basePerBucket) && basePerBucket > 0) {
      return stockBase / basePerBucket;
    }
    // Fallback: Tahini is usually tracked in kg, one bucket is 18 kg.
    const ru = (tahini.unit ?? "").toLowerCase().trim();
    if (ru === "kg") return stockBase / 18;
    if (ru === "g") return stockBase / 18000;
    return null;
  }, [rawIngredients, currentRawStockById, packSizesByIngredient]);

  const visibleSuppliers = useMemo(() => {
    return sortedSuppliers.filter((s) => {
      if (!isTodayFoodGroupSupplier(s.name)) return true;
      if (tahiniBucketsLeft == null) return true;
      return tahiniBucketsLeft < 2;
    });
  }, [sortedSuppliers, tahiniBucketsLeft]);

  const suppliersByOrderMode = useMemo(() => {
    const active: Supplier[] = [];
    const planning: Supplier[] = [];
    for (const sup of visibleSuppliers) {
      const deliveryDaysForSup = schedulesBySupplier[sup.id] ?? [];
      const orderDay = isSupplierOrderDayToday(
        sup.name,
        deliveryDaysForSup,
        orderingDayAnchor,
        orderDayContext
      );
      const lines = orderBySupplier[sup.id] ?? [];
      const suggestedForSup = Object.entries(suggestedOrder).filter(
        ([rawId, qty]) => qty > 0 && suggestionSupplierByRaw[rawId] === sup.id
      );
      const hasOrderWork = lines.length > 0 || suggestedForSup.length > 0;
      if (hasOrderWork && !orderDay) planning.push(sup);
      else active.push(sup);
    }
    return { active, planning };
  }, [
    visibleSuppliers,
    schedulesBySupplier,
    orderingDayAnchor,
    orderBySupplier,
    suggestedOrder,
    suggestionSupplierByRaw,
    orderDayContext,
  ]);

  const planningSupplierIdSet = useMemo(
    () => new Set(suppliersByOrderMode.planning.map((s) => s.id)),
    [suppliersByOrderMode.planning]
  );

  const planningSuppliers = suppliersByOrderMode.planning;

  const hiddenSupplierIdSet = useMemo(() => {
    const visible = new Set(visibleSuppliers.map((s) => s.id));
    return new Set(sortedSuppliers.filter((s) => !visible.has(s.id)).map((s) => s.id));
  }, [sortedSuppliers, visibleSuppliers]);

  const resetOrderLinesFromSuggestion = () => {
    if (!locationId || suggestionRefreshing) return;
    setManualOrderOverrides(null);
    setDraftRestored(false);
    setRecalculateFeedback(null);
    recalculateRequestedRef.current = true;
    setSuggestionRefreshing(true);
    const today = localCalendarDateString();
    setViewDate(today);
    const supabase = createClient();
    void (async () => {
      try {
        const { rawList, packList } = await loadRawIngredientsWithPacks(supabase, locationId);
        setRawIngredients(rawList);
        setPackSizes(packList);
        setSupplementalPackSizes([]);
        setSuggestionRefreshToken((v) => v + 1);
      } catch (e) {
        recalculateRequestedRef.current = false;
        setSuggestionRefreshing(false);
        setRecalculateFeedback(
          e instanceof Error ? e.message : "Could not refresh catalog from database."
        );
      }
    })();
  };

  const removeLine = (supplierId: string, lineKey: string) => {
    setManualOrderOverrides((prev) => {
      const base = { ...(prev ?? autoOrderBySupplierRef.current) };
      const list = (base[supplierId] ?? []).filter((l) => orderLineKey(l) !== lineKey);
      if (list.length === 0) {
        const next = { ...base };
        delete next[supplierId];
        return next;
      }
      return { ...base, [supplierId]: list };
    });
  };

  const updateLineQuantity = (supplierId: string, lineKey: string, quantity: number) => {
    const qty = Number.isFinite(quantity) ? Math.max(0, Math.round(quantity)) : 0;
    setManualOrderOverrides((prev) => {
      const base = { ...(prev ?? autoOrderBySupplierRef.current) };
      const list = [...(base[supplierId] ?? [])];
      const index = list.findIndex((l) => orderLineKey(l) === lineKey);
      if (index < 0) return base;
      list[index] = { ...list[index], quantity: qty };
      return { ...base, [supplierId]: list };
    });
  };

  const snapLineQuantityToColi = (supplierId: string, line: OrderLine) => {
    const packs = packSizesByIngredient[line.raw_ingredient_id] ?? [];
    const pack =
      packs.find((p) => p.id === line.pack_size_id) ?? getOrderPackDeterministic(packsForOrder(packs)) ?? getBestPackSize(packsForOrder(packs));
    const rawIng = rawIngredients.find((r) => r.id === line.raw_ingredient_id);
    const mult = rawIng?.order_pack_multiple ?? pack?.order_pack_multiple ?? 1;
    if (line.quantity <= 0 || mult <= 1) return;
    const snapped = applyOrderPackMultipleRounding(line.quantity, mult);
    if (snapped !== line.quantity) {
      updateLineQuantity(supplierId, orderLineKey(line), snapped);
    }
  };

  const addLineForSupplierRaw = (supplierId: string, rawId: string) => {
    const ing = rawIngredients.find((r) => r.id === rawId);
    if (!ing) return;
    const allPacks = packSizesByIngredient[rawId] ?? [];
    const orderPacks = packsForOrder(allPacks);
    const kind = suggestionOrderKindByRaw[rawId] ?? "pack";

    const pushLine = (pack: IngredientPackSize | null | undefined, quantity: number) => {
      if (!pack || quantity <= 0) return;
      const line: OrderLine = {
        raw_ingredient_id: rawId,
        raw_ingredient_name: ing.name,
        pack_size_id: pack.id,
        pack_size_label: `${pack.size} ${pack.size_unit}`,
        size: pack.size,
        size_unit: pack.size_unit,
        price_cents: pack.price_cents ?? null,
        quantity,
      };
      setManualOrderOverrides((prev) => {
        const base = { ...(prev ?? autoOrderBySupplierRef.current) };
        return {
          ...base,
          [supplierId]: mergeOrderLines([...(base[supplierId] ?? []), line]),
        };
      });
    };

    if (isParsleyRawName(ing.name)) {
      const box4 =
        orderPacks.find((p) => p.size === 4 && p.size_unit === "kg") ??
        orderPacks.find((p) => (p.display_unit_label ?? "").toLowerCase().includes("4")) ??
        getOrderPackDeterministic(orderPacks) ?? getBestPackSize(orderPacks);
      if (box4) {
        pushLine(box4, 1);
        setNewRawBySupplier((prev) => ({ ...prev, [supplierId]: "" }));
        return;
      }
    }

    const best = getOrderPackDeterministic(orderPacks) ?? getBestPackSize(orderPacks) ?? getOrderPackDeterministic(allPacks) ?? getBestPackSize(allPacks);
    const line: OrderLine = {
      raw_ingredient_id: rawId,
      raw_ingredient_name: ing.name,
      pack_size_id: best?.id ?? null,
      pack_size_label: best
        ? `${best.size} ${best.size_unit}`
        : kind === "stocktake"
          ? stocktakeOrderUnitLabel(ing, allPacks)
          : `Total (${ing.unit || "unit"})`,
      size: best?.size ?? (kind === "stocktake" ? 1 : 0),
      size_unit: best?.size_unit ?? (kind === "stocktake" ? ing.unit ?? "" : ""),
      price_cents: best?.price_cents ?? null,
      quantity: 1,
    };
    setManualOrderOverrides((prev) => {
      const base = { ...(prev ?? autoOrderBySupplierRef.current) };
      return {
        ...base,
        [supplierId]: mergeOrderLines([...(base[supplierId] ?? []), line]),
      };
    });
    setNewRawBySupplier((prev) => ({ ...prev, [supplierId]: "" }));
  };

  async function createOrderForSupplier(
    supplierId: string,
    lines: OrderLine[],
    orderDate: string
  ): Promise<string> {
    const supabase = createClient();
    if (!locationId) throw new Error("No location selected");

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        location_id: locationId,
        supplier_id: supplierId,
        order_date: orderDate,
        status: "submitted",
      })
      .select("id")
      .single();
    if (orderErr) throw orderErr;

    const orderId = (order as { id: string }).id;
    for (const line of lines) {
      if (line.quantity <= 0) continue;
      const { error: lineErr } = await supabase.from("order_line_items").insert({
        order_id: orderId,
        raw_ingredient_id: line.raw_ingredient_id,
        pack_size_id: line.pack_size_id,
        quantity: line.quantity,
      });
      if (lineErr) throw lineErr;
    }
    return orderId;
  }

  const dispatchOneSupplier = async (supplierId: string, dryRun: boolean) => {
    if (!locationId) return;
    const lines = orderBySupplier[supplierId] ?? [];
    if (lines.length === 0) return;

    setDispatchStatusBySupplier((prev) => ({
      ...prev,
      [supplierId]: {
        loading: true,
        loadingAction: dryRun ? "dry_run" : "send",
        message: undefined,
        error: undefined,
        dryRun: dryRun,
      },
    }));

    try {
      const orderDate = localCalendarDateString();
      const orderId = await createOrderForSupplier(supplierId, lines, orderDate);
      const supabase = createClient();
      const { data, error: invokeErr } = await supabase.functions.invoke("dispatch-order", {
        body: {
          order_id: orderId,
          dry_run: dryRun,
          requested_delivery_date: null,
        },
      });
      if (invokeErr) {
        let detail = invokeErr.message;
        const maybeContext = invokeErr as unknown as {
          context?: unknown;
          details?: string;
          hint?: string;
          code?: string;
        };
        const pieces: string[] = [];

        if (maybeContext.details) pieces.push(maybeContext.details);
        if (maybeContext.hint) pieces.push(maybeContext.hint);
        if (maybeContext.code) pieces.push(`code=${maybeContext.code}`);

        const ctx = maybeContext.context as
          | {
              json?: () => Promise<unknown>;
              text?: () => Promise<string>;
              error?: string;
              detail?: string;
            }
          | string
          | null
          | undefined;

        if (ctx && typeof ctx === "object" && "json" in ctx && typeof ctx.json === "function") {
          try {
            const body = (await ctx.json()) as { error?: string; detail?: string; message?: string };
            if (body?.error) pieces.push(body.error);
            if (body?.detail) pieces.push(body.detail);
            if (body?.message) pieces.push(body.message);
          } catch {
            // ignore parse errors and keep fallback handling
          }
        } else if (ctx && typeof ctx === "object") {
          const body = ctx as { error?: string; detail?: string; message?: string };
          if (body.error) pieces.push(body.error);
          if (body.detail) pieces.push(body.detail);
          if (body.message) pieces.push(body.message);
        } else if (ctx && typeof ctx === "string") {
          pieces.push(ctx);
        }

        if (pieces.length > 0) {
          detail = `${detail} | ${pieces.join(" | ")}`;
        }
        throw new Error(detail);
      }

      const payload = data as {
        ok?: boolean;
        message?: string;
        error?: string;
        channel?: string;
      } | null;
      if (payload?.ok === false) throw new Error(payload.error ?? "Dispatch failed");

      const backendMsg = typeof payload?.message === "string" ? payload.message.trim() : "";
      const hasSkippedLines =
        /overgeslagen|skipped/i.test(backendMsg) && !dryRun;
      const successMessage = dryRun
        ? formatDryRunSuccessMessage(payload ?? {})
        : hasSkippedLines
          ? `Sent with warnings — ${backendMsg}`
          : `Sent OK${backendMsg ? ` — ${backendMsg}` : ""}`;

      setDispatchStatusBySupplier((prev) => ({
        ...prev,
        [supplierId]: {
          loading: false,
          loadingAction: undefined,
          dryRun,
          message: successMessage,
        },
      }));
    } catch (e) {
      setDispatchStatusBySupplier((prev) => ({
        ...prev,
        [supplierId]: {
          loading: false,
          loadingAction: undefined,
          dryRun,
          error: dryRun
            ? `Dry run failed — ${e instanceof Error ? e.message : "Unknown error"}`
            : e instanceof Error
              ? e.message
              : "Dispatch failed",
        },
      }));
    }
  };

  const confirmOrder = async () => {
    if (!locationId) return;
    setSubmitting(true);
    setError(null);
    const orderDate = localCalendarDateString();

    try {
      for (const [supplierId, lines] of Object.entries(orderBySupplier)) {
        if (lines.length === 0) continue;
        if (hiddenSupplierIdSet.has(supplierId)) continue;
        if (planningSupplierIdSet.has(supplierId)) continue;
        await createOrderForSupplier(supplierId, lines, orderDate);
      }
      setSubmitted(true);
      setManualOrderOverrides(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit order");
    } finally {
      setSubmitting(false);
    }
  };

  const hasAnyLines = useMemo(() => {
    return Object.entries(orderBySupplier).some(([supplierId, arr]) => {
      if (arr.length === 0) return false;
      if (hiddenSupplierIdSet.has(supplierId)) return false;
      if (planningSupplierIdSet.has(supplierId)) return false;
      return true;
    });
  }, [orderBySupplier, hiddenSupplierIdSet, planningSupplierIdSet]);

  const locationName = locationOptions.find((l) => l.id === locationId)?.name ?? "";

  const togglePlanningExpanded = (supplierId: string) => {
    setExpandedPlanningSupplierIds((prev) => {
      const next = new Set(prev);
      if (next.has(supplierId)) next.delete(supplierId);
      else next.add(supplierId);
      return next;
    });
  };

  const renderSupplierCard = (sup: Supplier, mode: "active" | "planning") => {
    const days = daysUntilDeliveryIfOrderingToday(sup.id);
    const deliveryDaysForSup = schedulesBySupplier[sup.id] ?? [];
    const hasWeekdaySchedule = deliveryDaysForSup.length > 0;
    const onDemandSup = isOnDemandSupplierName(sup.name);
    const tomorrowIsDelivery =
      onDemandSup ||
      !hasWeekdaySchedule ||
      isNextCalendarDayDelivery({
        fromDate: orderingDayAnchor,
        deliveryDays: deliveryDaysForSup,
      });
    const lines = orderBySupplier[sup.id] ?? [];
    const suggestedForSup = Object.entries(suggestedOrder).filter(
      ([rawId, qty]) => qty > 0 && suggestionSupplierByRaw[rawId] === sup.id
    );
    const hasOrderWork = lines.length > 0 || suggestedForSup.length > 0;
    const linesToShow = [...lines].sort((a, b) =>
      (a.raw_ingredient_name ?? "").localeCompare(b.raw_ingredient_name ?? "", "en", {
        sensitivity: "base",
      })
    );
    const isPlanning = mode === "planning" && !allowOffScheduleOrdering;
    const planningExpanded = expandedPlanningSupplierIds.has(sup.id);
    const cardEmphasized =
      !isPlanning && hasOrderWork && (!hasWeekdaySchedule || onDemandSup || tomorrowIsDelivery);

    const sectionClass = isPlanning
      ? "rounded-xl border border-brand-green/10 bg-brand-sand/50 p-3 opacity-80 "
      : !hasOrderWork
        ? "rounded-xl border border-dashed border-brand-green/15 bg-background p-4 "
        : cardEmphasized
          ? "card "
          : "rounded-xl border border-dashed border-brand-green/15 bg-background/90 p-4 ";
    const headingClass = isPlanning
      ? "font-medium text-ink-soft/80"
      : !hasOrderWork
        ? "font-medium text-ink-soft/80"
        : cardEmphasized
          ? "font-semibold text-ink"
          : "font-medium text-ink-soft";
    const deliveryMetaClass = isPlanning
      ? "text-xs text-ink-soft/60"
      : !hasOrderWork
        ? "text-sm text-ink-soft/60"
        : cardEmphasized
          ? "help-text"
          : "help-text";
    const supplierRawIds = supplierRawIdsBySupplier[sup.id] ?? [];
    const addableRawIds = supplierRawIds
      .filter((rid) => {
        if (linesToShow.some((line) => line.raw_ingredient_id === rid)) return false;
        const ing = rawIngredients.find((r) => r.id === rid);
        return ing != null && isRawVisibleOnStocktakeForLocation(ing, locationId);
      })
      .sort((a, b) => {
        const na = rawIngredients.find((r) => r.id === a)?.name ?? "";
        const nb = rawIngredients.find((r) => r.id === b)?.name ?? "";
        return na.localeCompare(nb, "en", { sensitivity: "base" });
      });
    const selectedNewRaw = newRawBySupplier[sup.id] ?? "";
    const hasManualOptions = addableRawIds.length > 0;
    const hasAnyWork = hasOrderWork || hasManualOptions;
    const showLines = !isPlanning || planningExpanded;

    return (
      <section key={sup.id} className={sectionClass}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={headingClass}>{sup.name}</h2>
            {isPlanning && (
              <span className="badge-pending rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide">
                Do not send
              </span>
            )}
            {onDemandSup && !isPlanning && (
              <span className="rounded-full bg-brand-sand/50 px-2 py-0.5 text-[10px] font-medium text-ink-soft">
                On demand
              </span>
            )}
          </div>
          <span className={deliveryMetaClass}>
            {nextDeliveryLabel(sup.name, days, deliveryLabelContext)}
          </span>
        </div>

        {isPlanning && !allowOffScheduleOrdering && (
          <div className="mb-2 rounded-lg border border-brand-green/10 bg-background/80 px-3 py-2 text-xs text-ink-soft/70">
            <p className="font-medium text-ink-soft">Not an order day — preview only</p>
            {onDemandSup && weeklyDayLabel ? (
              <p className="mt-1">
                {sup.name} is ordered on {weeklyDayLabel} after the weekly stocktake. Turn on
                &quot;Allow ordering today&quot; below to send anyway.
              </p>
            ) : hasWeekdaySchedule ? (
              <p className="mt-1">
                Deliveries: {formatJsDeliveryDays(deliveryDaysForSup)}. Order the day before delivery.
              </p>
            ) : weeklyDayLabel ? (
              <p className="mt-1">Kitchen order day: {weeklyDayLabel} (weekly stocktake).</p>
            ) : null}
          </div>
        )}

        {isPlanning && allowOffScheduleOrdering && (
          <div className="mb-2 rounded-lg border border-accent-orange/20 bg-accent-orange/5 px-3 py-2 text-xs text-ink-soft">
            <p className="font-medium text-ink">Off-schedule ordering enabled — you can send today</p>
          </div>
        )}

        {!hasAnyWork && !isPlanning && (
          <p className="mb-3 text-xs text-ink-soft/70">
            No order suggestion and no lines — nothing to do here for now.
          </p>
        )}

        {isPlanning && hasOrderWork && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-xs text-ink-soft/70">
              {linesToShow.length} suggested item{linesToShow.length === 1 ? "" : "s"} — for reference only
            </p>
            <button
              type="button"
              onClick={() => togglePlanningExpanded(sup.id)}
              className="rounded-md border border-brand-sage/50 bg-surface/60 px-2 py-1 text-[11px] font-medium text-ink-soft/80"
            >
              {planningExpanded ? "Hide preview" : "Show preview"}
            </button>
          </div>
        )}

        {showLines && (
          <ul className={`space-y-2 ${isPlanning ? "opacity-75" : ""}`}>
            {linesToShow.map((line) => {
              const lineKey = orderLineKey(line);
              const ing = rawIngredients.find((r) => r.id === line.raw_ingredient_id);
              const kind = suggestionOrderKindByRaw[line.raw_ingredient_id] ?? "pack";
              const row = orderLineRowView(
                line,
                kind,
                ing,
                packSizesByIngredient[line.raw_ingredient_id] ?? []
              );
              const linePacks = packSizesByIngredient[line.raw_ingredient_id] ?? [];
              const linePack =
                linePacks.find((p) => p.id === line.pack_size_id) ??
                getOrderPackDeterministic(packsForOrder(linePacks)) ?? getBestPackSize(packsForOrder(linePacks));
              const lineRawIng = rawIngredients.find((r) => r.id === line.raw_ingredient_id);
              const coliMultiple = Math.max(1, lineRawIng?.order_pack_multiple ?? linePack?.order_pack_multiple ?? 1);
              // Spinner moves in the colli step so arrow clicks land on valid quantities.
              const qtyStep = coliMultiple;
              return (
                <li
                  key={`${sup.id}-${lineKey}`}
                  className={
                    isPlanning
                      ? "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed border-brand-green/10 bg-background/40 px-3 py-2 text-xs text-ink-soft/70 "
                      : "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-brand-green/10 bg-background/50 px-3 py-2.5 text-sm "
                  }
                >
                  <span
                    className={
                      isPlanning
                        ? "min-w-[7rem] flex-1 font-normal text-ink-soft/80"
                        : "min-w-[7rem] flex-1 font-medium text-ink"
                    }
                  >
                    {row.product}
                  </span>
                  <span
                    className={
                      isPlanning
                        ? "w-14 shrink-0 tabular-nums text-ink-soft/80"
                        : "w-14 shrink-0 tabular-nums text-ink"
                    }
                  >
                    {isPlanning ? (
                      row.countTimes
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step={qtyStep}
                        value={line.quantity === 0 ? "" : line.quantity}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            updateLineQuantity(sup.id, lineKey, 0);
                            return;
                          }
                          updateLineQuantity(sup.id, lineKey, Number(raw));
                        }}
                        onBlur={() => snapLineQuantityToColi(sup.id, line)}
                        className="w-14 rounded border border-brand-green/15 bg-surface px-1 py-0.5 text-right text-sm tabular-nums text-ink"
                        aria-label={`Quantity for ${row.product}`}
                      />
                    )}
                  </span>
                  {!isPlanning && (
                    <span className="w-3 shrink-0 text-ink-soft">×</span>
                  )}
                  <span
                    className={
                      isPlanning
                        ? "min-w-[6rem] flex-1 text-ink-soft/80"
                        : "min-w-[6rem] flex-1 text-ink-soft"
                    }
                  >
                    {row.packType}
                  </span>
                  <span
                    className={
                      isPlanning
                        ? "w-24 shrink-0 text-right font-normal tabular-nums text-ink-soft/80"
                        : "w-24 shrink-0 text-right font-medium tabular-nums text-ink"
                    }
                  >
                    {row.totalLabel}
                  </span>
                  {!isPlanning && (
                    <button
                      type="button"
                      onClick={() => removeLine(sup.id, lineKey)}
                      className="shrink-0 alert-error rounded-lg px-2 py-1.5 text-xs"
                    >
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!isPlanning && linesToShow.length > 0 && (() => {
          const dispatchStatus = dispatchStatusBySupplier[sup.id];
          const dryRunLoading =
            Boolean(dispatchStatus?.loading) && dispatchStatus?.loadingAction === "dry_run";
          const sendLoading =
            Boolean(dispatchStatus?.loading) && dispatchStatus?.loadingAction === "send";
          const anyLoading = dryRunLoading || sendLoading;
          return (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <span className="rounded-md bg-brand-sand/50 px-2 py-1 text-[11px] text-ink-soft">
              Delivery: as soon as possible
            </span>
            <button
              type="button"
              onClick={() => void dispatchOneSupplier(sup.id, true)}
              disabled={anyLoading || isHistoricalView}
              className={`rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50 ${
                dryRunLoading
                  ? "border-brand-green/30 bg-brand-sand/60 text-ink"
                  : "border-brand-green/15 bg-surface text-ink"
              }`}
            >
              {dryRunLoading ? "Dry run…" : "Dry run supplier"}
            </button>
            <button
              type="button"
              onClick={() => void dispatchOneSupplier(sup.id, false)}
              disabled={anyLoading || isHistoricalView}
              className="btn-primary rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              {sendLoading ? "Sending…" : "Send supplier"}
            </button>
          </div>
          );
        })()}

        {!isPlanning && addableRawIds.length > 0 && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
              Add item
              <select
                value={selectedNewRaw}
                onChange={(e) =>
                  setNewRawBySupplier((prev) => ({
                    ...prev,
                    [sup.id]: e.target.value,
                  }))
                }
                className="rounded-lg border border-brand-green/15 bg-surface px-3 py-2 text-xs text-ink"
              >
                <option value="" disabled>
                  Select item…
                </option>
                {addableRawIds.map((rid) => {
                  const ing = rawIngredients.find((r) => r.id === rid);
                  return (
                    <option key={rid} value={rid}>
                      {ing?.name ?? rid}
                    </option>
                  );
                })}
              </select>
            </label>
            <button
              type="button"
              onClick={() => selectedNewRaw && addLineForSupplierRaw(sup.id, selectedNewRaw)}
              disabled={!selectedNewRaw}
              className="rounded-lg border border-brand-green/15 bg-surface px-3 py-2 text-xs font-medium text-ink disabled:opacity-50"
            >
              Add to order
            </button>
          </div>
        )}

        {!isPlanning && dispatchStatusBySupplier[sup.id]?.message && (
          <p
            className={`mt-2 text-xs ${
              dispatchStatusBySupplier[sup.id]?.dryRun
                ? /warnings/i.test(dispatchStatusBySupplier[sup.id]?.message ?? "")
                  ? "text-accent-terracotta"
                  : "text-ink"
                : /warnings|overgeslagen|skipped/i.test(dispatchStatusBySupplier[sup.id]?.message ?? "")
                  ? "text-accent-terracotta"
                  : "text-brand-green"
            }`}
          >
            {dispatchStatusBySupplier[sup.id]?.message}
          </p>
        )}
        {!isPlanning && dispatchStatusBySupplier[sup.id]?.error && (
          <p className="mt-2 text-xs text-accent-terracotta">
            {dispatchStatusBySupplier[sup.id]?.error}
          </p>
        )}
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-background font-sans">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-28 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="section-title text-xl sm:text-2xl">
            Ordering
          </h1>
          <Link href="/dashboard" className="text-sm font-medium text-ink-soft/80">
            Dashboard
          </Link>
        </div>

        <DailyWorkflowStepper
          completedSteps={{
            "/stocktake": workflowStocktakeComplete,
            "/prep-list": false,
          }}
        />

        {error && (
          <div className="alert-error mb-4 rounded-xl p-4 text-sm">
            {error}
          </div>
        )}

        {submitted && (
          <div className="badge-success mb-4 rounded-xl p-4 text-sm">
            Orders submitted successfully.
          </div>
        )}

        {suggestionLoadError && (
          <div className="alert-error mb-4 rounded-xl p-4 text-sm">
            Failed to load order suggestion: {suggestionLoadError}
          </div>
        )}

        {locationName && (
          <div className="mb-4 help-text">
            <p>
              Order for: <strong className="text-ink">{locationName}</strong>
            </p>
            <p className="mt-1 text-xs text-ink-soft/70">
              Each card lists items for that supplier from Admin (supplier ingredients). You see product, amount, and
              unit — adjust mappings in Admin if something is wrong. Confirm once to save orders in the app.
            </p>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-brand-green/25 bg-brand-sand/60 px-4 py-3 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">
              Review day (stock &amp; suggestions)
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
              {new Date(`${viewDate}T12:00:00`).toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Use Previous day to compare last week&apos;s counts and suggestions. Orders can only be sent on Today.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={viewDate}
              max={todayDateStr}
              onChange={(e) => {
                const v = e.target.value;
                if (v && v <= todayDateStr) setViewDate(v);
              }}
              className="rounded-lg border border-brand-green/20 bg-surface px-2 py-1.5 text-xs font-medium text-ink"
              aria-label="Jump to date"
            />
            <button
              type="button"
              onClick={() => setViewDate((d) => shiftCalendarDateString(d, -1))}
              className="rounded-lg border border-brand-green/15 bg-background px-3 py-1.5 text-xs font-medium text-ink hover:bg-brand-sand/40"
            >
              Previous day
            </button>
            <button
              type="button"
              onClick={() => setViewDate(todayDateStr)}
              disabled={!isHistoricalView}
              className="rounded-lg border border-brand-green/15 bg-background px-3 py-1.5 text-xs font-medium text-ink hover:bg-brand-sand/40 disabled:opacity-40"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setViewDate((d) => shiftCalendarDateString(d, 1))}
              disabled={viewDate >= todayDateStr}
              className="rounded-lg border border-brand-green/15 bg-background px-3 py-1.5 text-xs font-medium text-ink hover:bg-brand-sand/40 disabled:opacity-40"
            >
              Next day
            </button>
          </div>
        </div>

        {isHistoricalView && (
          <div className="mb-4 rounded-xl border border-accent-orange/30 bg-accent-orange/10 px-4 py-3 text-sm text-ink">
            Viewing historical stock and order suggestions for {viewDate}. Sending orders is disabled — switch to Today to
            place orders.
          </div>
        )}

        <ChickpeaSoakCallout kg={soakDryChickpeasKg} />

        {locationId && (
          <div className="mb-4 rounded-xl border border-brand-green/10 bg-brand-sand/40 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={resetOrderLinesFromSuggestion}
                disabled={suggestionRefreshing}
                className="rounded-lg border border-brand-green/20 bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-brand-sand/40 disabled:cursor-wait disabled:opacity-60"
              >
                {suggestionRefreshing ? "Refreshing from stocktake…" : "Recalculate from stocktake"}
              </button>
              {recalculateFeedback && (
                <span className="text-xs text-brand-green">{recalculateFeedback}</span>
              )}
              {draftRestored && manualOrderOverrides != null && !recalculateFeedback && (
                <span className="text-xs text-brand-green font-medium">
                  Draft restored — your edits from earlier today have been reloaded.
                </span>
              )}
              {manualOrderOverrides != null && !draftRestored && !recalculateFeedback && (
                <span className="text-xs text-accent-orange">
                  Manual edits — click Recalculate to refresh from latest counts.
                </span>
              )}
              {draftSaveFailed && (
                <span className="text-xs text-accent-terracotta font-medium">
                  Could not save your draft — check your connection or permissions.
                </span>
              )}
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-3 border-t border-brand-green/10 pt-3">
              <input
                type="checkbox"
                checked={allowOffScheduleOrdering}
                onChange={(e) => setAllowOffScheduleOrdering(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-brand-green/30"
              />
              <span className="text-sm">
                <span className="font-medium text-ink">Allow ordering today (off schedule)</span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  {isWeeklyKitchenDay
                    ? `Today is ${weeklyDayLabel ?? "the weekly stocktake day"} — suppliers are ready to order.`
                    : weeklyDayLabel
                      ? `Normally order on ${weeklyDayLabel} after weekly stocktake, or the day before each supplier's delivery. Enable this to send anyway.`
                      : "Enable to send supplier orders even when today is not the usual order day."}
                </span>
              </span>
            </label>
          </div>
        )}

        {suggestedUnassignedRawIds.length > 0 && (
          <div className="mb-4 alert-warning rounded-lg text-xs">
            <span className="font-medium">No preferred supplier in Admin for:</span>{" "}
            {suggestedUnassignedRawIds
              .map((id) => rawIngredients.find((r) => r.id === id)?.name ?? id)
              .join(", ")}
            . Add mappings under Supplier ingredients to include these in suggested orders.
          </div>
        )}

        {!loading &&
          locationId &&
          !suggestionLoadError &&
          rawIngredients.length > 0 &&
          Object.keys(suggestedOrder).length === 0 &&
          suggestedUnassignedRawIds.length === 0 &&
          suggestionInsight && (
            <div className="mb-6 rounded-xl border border-brand-green/10 bg-brand-sand/50/60 p-4 text-sm text-ink-soft">
              <p className="font-medium text-ink">No automatic suggestion</p>
              <p className="mt-2 text-xs leading-relaxed">
                The suggestion uses <strong>prep need × cover window − stock</strong> (not stocktake alone). Below is what
                loaded for date <strong>{suggestionInsight.dateUsed}</strong> (local date on this device — same calendar
                day you should use for stocktake).
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                <strong>Note:</strong> order need = cover window + evening + pickling lead − section 2 raw stock −
                finished prep credit (pickles, yoghurt, aubergine, lemon juice, feta, pomegranate, …). Prep counts
                from section 1 apply even when other prep lines are still open.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                <strong>Order packs vs stocktake:</strong> the app first computes need in <strong>base units</strong> (as
                on recipes). With an <strong>order pack</strong> (<code className="text-[11px]">ingredient_pack_sizes</code>
                ) that converts to order packs. <strong>Without order packs</strong> it falls back to the same{" "}
                <strong>stocktake unit</strong> as on the count (master B/C/D or stocktake-pack), often the ordering
                unit. Only if that is missing does it round in <strong>recipe units</strong>.
              </p>
              <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-ink-soft">
                <li>Raw ingredients for location in app: {suggestionInsight.locationRawCount}</li>
                <li>Prep products linked to location: {suggestionInsight.prepLinkedCount}</li>
                <li>Recipe rows (prep → raw) for those preps: {suggestionInsight.recipeRowsForLocation}</li>
                <li>Sum of daily raw need (recipe): {formatDecimal2(suggestionInsight.dailyRawNeedSum)}</li>
                <li>Order need in base units after cover: {formatDecimal2(suggestionInsight.baseOrderNeedSum)}</li>
                <li>Stock rows on this date: {suggestionInsight.stockRowsForDate}</li>
                <li>
                  Revenue scaling: per day at €4.500 baseline — cover days{" "}
                  {suggestionInsight.revenueCoverDates.length > 0
                    ? suggestionInsight.revenueCoverDates.join(", ")
                    : "(none)"}
                  ; evening on {suggestionInsight.revenueEveningDate}. Days without a target count as full
                  capacity.
                </li>
                <li>
                  Suggestion lines (total): {suggestionInsight.suggestionLineCount} — converted to order packs:{" "}
                  {suggestionInsight.packConversionLineCount}, without packs (stocktake/recipe):{" "}
                  {suggestionInsight.baseFallbackLineCount}
                </li>
                <li>Pack rows loaded from DB for this suggestion: {suggestionInsight.packRowsLoadedFromDb}</li>
                {suggestionInsight.unmatchedRecipeNames.length > 0 && (
                  <li className="text-accent-terracotta">
                    Unmatched recipe rows at this location: {suggestionInsight.unmatchedRecipeNames.length} —{" "}
                    {suggestionInsight.unmatchedRecipeNames.join(", ")}
                  </li>
                )}
              </ul>
              {suggestionInsight.packFetchError && (
                <p className="mt-2 text-xs font-medium text-accent-terracotta">
                  Pack query partially failed: {suggestionInsight.packFetchError}
                </p>
              )}
              {suggestionInsight.stockRowsForDate === 0 && (
                <p className="mt-3 text-xs font-medium text-accent-terracotta">
                  There are no stock counts in the database for {suggestionInsight.dateUsed}. Check that stocktake was
                  saved on the <strong>same calendar day</strong> (the app used to use UTC midnight — that can be off by
                  one day).
                </p>
              )}
              {suggestionInsight.prepLinkedCount > 0 && suggestionInsight.recipeRowsForLocation === 0 && (
                <p className="mt-3 text-xs font-medium text-accent-terracotta">
                  No recipe rows are linked to this location&apos;s prep products. Fill{" "}
                  <strong>prep_item_ingredients</strong> (Admin / import).
                </p>
              )}
              {suggestionInsight.recipeRowsForLocation > 0 &&
                suggestionInsight.dailyRawNeedSum <= 0 &&
                suggestionInsight.prepLinkedCount > 0 && (
                  <p className="mt-3 text-xs font-medium text-accent-terracotta">
                    Daily need is 0 (e.g. revenue target = 0 or missing revenue row while full capacity is set). With no
                    revenue target for today we plan with multiplier 1.
                  </p>
                )}
              {suggestionInsight.baseOrderNeedSum <= 0 &&
                suggestionInsight.dailyRawNeedSum > 0 &&
                suggestionInsight.stockRowsForDate > 0 && (
                  <p className="mt-3 text-xs text-ink-soft">
                    On this calculation, entered stock covers need until after the next delivery (or there is no
                    shortfall in base units).
                  </p>
                )}
              {suggestionInsight.baseOrderNeedSum > 0 && suggestionInsight.suggestionLineCount === 0 && (
                <p className="mt-3 text-xs font-medium text-accent-terracotta">
                  There is calculated need in base units but no suggestion lines (e.g. no raws linked to suppliers in
                  Admin → supplier ingredients).
                </p>
              )}
              {suggestionInsight.baseOrderNeedSum > 0 &&
                suggestionInsight.suggestionLineCount > 0 &&
                suggestionInsight.baseFallbackLineCount > 0 && (
                  <p className="mt-3 text-xs text-ink-soft">
                    {suggestionInsight.packRowsLoadedFromDb === 0
                      ? "Tip: no order pack rows yet — the app uses stocktake units (B/C/D) or recipe units where possible. Add ingredient_pack_sizes for order packs and pricing."
                      : "Some raws are missing a valid order pack — those lines use stocktake or recipe units. Check Admin → pack sizes (size &gt; 0, order/both)."}
                  </p>
                )}
            </div>
          )}

        {loading ? (
          <p className="py-8 text-ink-soft/80">Loading…</p>
        ) : !locationId ? (
          <p className="py-8 text-ink-soft/80">Select a location.</p>
        ) : suppliers.length === 0 ? (
          <p className="py-8 text-ink-soft/80">No suppliers for this location. Add them in Admin → Suppliers.</p>
        ) : (
          <div className="mt-6 space-y-8">
            {suppliersByOrderMode.active.map((sup) => renderSupplierCard(sup, "active"))}

            {planningSuppliers.length > 0 && !planningSectionExpanded && (
              <div className="rounded-xl border border-brand-green/10 bg-brand-sand/50/80 px-4 py-3">
                <p className="text-sm font-medium text-ink-soft">Not an order day — suppliers hidden</p>
                <p className="mt-1 text-xs text-ink-soft/70">
                  {planningSuppliers.map((s) => s.name).join(", ")} has suggestions for reference only.
                  {weeklyDayLabel ? ` Usual order day: ${weeklyDayLabel}.` : ""} Expand for a preview, or enable
                  off-schedule ordering above to send today.
                </p>
                <button
                  type="button"
                  onClick={() => setPlanningSectionExpanded(true)}
                  className="mt-3 rounded-md border border-brand-sage/50 bg-surface/60 px-3 py-1.5 text-xs font-medium text-ink-soft"
                >
                  Show planning preview
                </button>
              </div>
            )}

            {planningSectionExpanded && planningSuppliers.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-ink-soft">Planning preview — do not send unless off-schedule is enabled</p>
                  <button
                    type="button"
                    onClick={() => setPlanningSectionExpanded(false)}
                    className="rounded-md border border-brand-sage/50 bg-surface/60 px-2 py-1 text-[11px] font-medium text-ink-soft/80"
                  >
                    Hide preview
                  </button>
                </div>
                {planningSuppliers.map((sup) => renderSupplierCard(sup, "planning"))}
              </div>
            )}
          </div>
        )}

        {hasAnyLines && (
          <div className="mt-8">
            <button
              type="button"
              onClick={confirmOrder}
              disabled={submitting}
              className="btn-primary input-lg w-full rounded-xl py-3 text-base font-medium disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Confirm order (save only)"}
            </button>
          </div>
        )}

        <div className="mt-8 flex gap-4">
          <Link href="/prep-list" className="text-sm font-medium text-ink-soft">
            ← Prep List
          </Link>
          <Link href="/admin" className="text-sm font-medium text-ink-soft">
            Admin →
          </Link>
        </div>
      </main>
    </div>
  );
}
