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
import {
  daysUntilDeliveryWhenOrderingToday,
  getDayOfWeek,
  isNextCalendarDayDelivery,
  isRawDeliverableTomorrow,
  supplierScheduleDayToJsDay,
  getBestPackSize,
  getOrderPackDeterministic,
  applyOrderPackMultipleRounding,
  getRevenueMultiplier,
} from "@/lib/calculations";
import { formatDecimal2, formatOrderAmount } from "@/lib/format";
import { ADJUSTMENT_REASONS, type AdjustmentReason } from "@/lib/orderAdjustments";
import {
  computeOrderSuggestion,
  loadRawIngredientsWithPacks,
  normSupplierName,
  normalizePackRow,
  packsForOrder,
  type OrderSuggestionSnapshotLine,
  type SuggestionOrderKind,
} from "@/lib/orderSuggestion";
import { localCalendarDateString } from "@/lib/date";
import { ensureEffectiveDailyRevenueTargetCents } from "@/lib/revenueTarget";
import {
  applyMediSaladSuggestedPacksCleanup,
  isParsleyRawName,
  locationUsesVanGelderMediSaladTub,
  parsleyOrderLines,
} from "@/lib/orderingAdjustments";
import {
} from "@/lib/drinkTrayPar";
import {
} from "@/lib/pitaPrepStock";
import { soakDryChickpeasKgFromPrepState } from "@/lib/chickpeaSoakPrepNeed";
import { isOnDemandSupplierName } from "@/lib/supplierOrderChannel";
import { JS_WEEKDAY_LABELS } from "@/lib/stocktakeWeek";
import { isWeeklyStocktakeDueOnDate } from "@/lib/stocktakeWeek";
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


type OrderLine = {
  raw_ingredient_id: string;
  raw_ingredient_name: string;
  pack_size_id: string | null;
  pack_size_label: string;
  size: number;
  size_unit: string;
  price_cents: number | null;
  quantity: number;
  /** Wat het systeem adviseerde in base units, vastgelegd bij het opbouwen van de regel. */
  suggested_base_qty?: number | null;
  /** Optionele incidentele reden dat deze regel afwijkt van de suggestie. */
  adjustment_reason?: AdjustmentReason | null;
  adjustment_note?: string | null;
};



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
    // Vastgelegd op de regel (en dus ook in het bewaarde concept), zodat een later
    // hersteld concept nog steeds toont wat het systeem oorspronkelijk adviseerde.
    const suggestedBaseQty = baseSuggestedByRaw?.[rawId] ?? null;
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
          suggested_base_qty: suggestedBaseQty,
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
        suggested_base_qty: suggestedBaseQty,
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
        suggested_base_qty: suggestedBaseQty,
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
      suggested_base_qty: suggestedBaseQty,
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
  /** Lines of the current suggestion, persisted to order_suggestion_snapshots. */
  const [suggestionSnapshotLines, setSuggestionSnapshotLines] = useState<
    OrderSuggestionSnapshotLine[] | null
  >(null);
  const [snapshotSaveError, setSnapshotSaveError] = useState<string | null>(null);
  /** True once an order exists for this location + date: the snapshot is frozen. */
  const [snapshotFrozen, setSnapshotFrozen] = useState(false);
  const snapshotSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const todayDateStr = useMemo(() => localCalendarDateString(), [suggestionRefreshToken]);
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

  // The freeze flag and any save error belong to one location + date pair.
  useEffect(() => {
    setSnapshotFrozen(false);
    setSnapshotSaveError(null);
  }, [locationId, todayDateStr]);

  /**
   * Debounced upsert of the computed suggestion into order_suggestion_snapshots.
   * Frozen once an order exists for this location + date: the snapshot has to keep
   * showing what was advised at the moment of ordering, not what a later recompute
   * (fresh counts, a new revenue target) would advise.
   */
  useEffect(() => {
    if (!locationId) return;
    if (snapshotFrozen) return;
    // null = suggestion not computed yet; writing [] would blank a real snapshot.
    if (suggestionSnapshotLines == null) return;
    const loc = locationId;
    const date = todayDateStr;
    const lines = suggestionSnapshotLines;
    if (snapshotSaveTimerRef.current) clearTimeout(snapshotSaveTimerRef.current);
    let cancelled = false;
    snapshotSaveTimerRef.current = setTimeout(() => {
      snapshotSaveTimerRef.current = null;
      void (async () => {
        const supabase = createClient();
        // Re-checked on every write, not once on load: an order can be placed while
        // the page stays open.
        const { count, error: ordersErr } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("location_id", loc)
          .eq("order_date", date);
        if (cancelled) return;
        if (ordersErr) {
          console.error("order_suggestion_snapshots freeze check failed:", ordersErr.message);
          setSnapshotSaveError(
            "Could not save the suggestion snapshot — check your connection or permissions."
          );
          return;
        }
        if ((count ?? 0) > 0) {
          setSnapshotFrozen(true);
          setSnapshotSaveError(null);
          return;
        }
        // created_at is deliberately not written here: the row keeps the timestamp of
        // the first capture for this location + date.
        const { error } = await supabase
          .from("order_suggestion_snapshots")
          .upsert({ location_id: loc, date, lines }, { onConflict: "location_id,date" });
        if (cancelled) return;
        if (error) {
          // Surface failures instead of failing silently (e.g. RLS denial).
          console.error("order_suggestion_snapshots upsert failed:", error.message);
          setSnapshotSaveError(
            "Could not save the suggestion snapshot — check your connection or permissions."
          );
        } else {
          setSnapshotSaveError(null);
        }
      })();
    }, 1200);
    return () => {
      cancelled = true;
      if (snapshotSaveTimerRef.current) {
        clearTimeout(snapshotSaveTimerRef.current);
        snapshotSaveTimerRef.current = null;
      }
    };
  }, [locationId, todayDateStr, suggestionSnapshotLines, snapshotFrozen]);

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
      setSuggestionSnapshotLines(null);
      return;
    }
    const d = todayDateStr;
    const requestLocationId = locationId;
    const supabase = createClient();

    /** Avoids setState after unmount or React Strict Mode re-run (stale async). */
    let alive = true;
    setSuggestionRefreshing(true);
    void (async () => {
      try {
        const result = await computeOrderSuggestion({
          supabase,
          locationId,
          date: d,
          rawIngredients,
          schedules,
          packSizes,
          suppliers,
          locationOrderingByRawId,
        });
        if (!alive || requestLocationId !== locationId) return;

        if (!result.ok) {
          setPrepStocktakeComplete(false);
          setSuggestedOrder({});
          setBaseSuggestedByRaw({});
          setSuggestionSupplierByRaw({});
          setSuggestionOrderKindByRaw({});
          setSuggestedUnassignedRawIds([]);
          setSupplementalPackSizes([]);
          setSuggestionSnapshotLines(null);
          setSuggestionLoadError(result.message);
          setSuggestionInsight(null);
          if (recalculateRequestedRef.current) {
            recalculateRequestedRef.current = false;
            setRecalculateFeedback(`Could not refresh from stocktake: ${result.message}`);
          }
          return;
        }

        setSuggestionLoadError(null);
        setPrepStocktakeComplete(result.prepStocktakeComplete);
        setCurrentRawStockById(result.currentRawStockById);
        setCurrentPrepStockById(result.currentPrepStockById);
        setRevenueTargetCentsForDraft(result.revenueTargetCents);
        setSupplierRawIdsBySupplier(result.supplierRawIdsBySupplier);
        setSuggestionSnapshotLines(result.snapshotLines);
        setSupplementalPackSizes(result.supplementalPackSizes);
        setMediSaladNeedPrep(result.mediSaladNeedPrep);
        setBaseSuggestedByRaw(result.baseSuggestedByRaw);
        setSuggestedOrder(result.suggestedOrder);
        setSuggestionOrderKindByRaw(result.suggestionOrderKindByRaw);
        setSuggestionSupplierByRaw(result.suggestionSupplierByRaw);
        setSuggestedUnassignedRawIds(result.suggestedUnassignedRawIds);
        setSuggestionInsight(result.insight);

        if (recalculateRequestedRef.current) {
          recalculateRequestedRef.current = false;
          const n = result.suggestionLineCount;
          const counts = result.stockRowsForDateCount;
          setRecalculateFeedback(
            n > 0
              ? `Refreshed from stocktake for ${d}: ${n} suggested line${n === 1 ? "" : "s"} (${counts} raw count${counts === 1 ? "" : "s"} today).`
              : `Refreshed from stocktake for ${d}. No order lines suggested (${counts} raw count${counts === 1 ? "" : "s"} today).`
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
      setSuggestionSnapshotLines(null);
      recalculateRequestedRef.current = false;
      setRecalculateFeedback("Could not refresh from stocktake. Check your connection and try again.");
      setSuggestionRefreshing(false);
    });

    return () => {
      alive = false;
    };
  }, [locationId, locationOptions, rawIngredients, schedules, packSizes, suppliers, suggestionRefreshToken, todayDateStr, locationOrderingByRawId]);

  useEffect(() => {
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
  }, []);

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
    () => new Date(`${todayDateStr}T12:00:00`),
    [todayDateStr]
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
    // todayDateStr hangt aan suggestionRefreshToken, die hieronder wordt opgehoogd —
    // zo rolt de datum alsnog om als de app over middernacht open blijft staan.
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
      // Terug op de gesuggereerde hoeveelheid = geen afwijking meer, dus ook geen reden:
      // anders zou een reden meegestuurd worden bij een regel die niet meer afwijkt.
      const suggestedQty =
        (autoOrderBySupplierRef.current[supplierId] ?? []).find(
          (l) => orderLineKey(l) === lineKey
        )?.quantity ?? 0;
      const clearReason = qty === suggestedQty;
      list[index] = {
        ...list[index],
        quantity: qty,
        adjustment_reason: clearReason ? null : list[index].adjustment_reason ?? null,
        adjustment_note: clearReason ? null : list[index].adjustment_note ?? null,
      };
      return { ...base, [supplierId]: list };
    });
  };

  /**
   * Zet (of wist) de incidentele reden op een orderregel. Nooit verplicht: leeg laten
   * is een geldige — en voor de patroondetectie juist betekenisvolle — uitkomst.
   */
  const updateLineAdjustment = (
    supplierId: string,
    lineKey: string,
    patch: { reason?: AdjustmentReason | null; note?: string | null }
  ) => {
    setManualOrderOverrides((prev) => {
      const base = { ...(prev ?? autoOrderBySupplierRef.current) };
      const list = [...(base[supplierId] ?? [])];
      const index = list.findIndex((l) => orderLineKey(l) === lineKey);
      if (index < 0) return base;
      const current = list[index];
      const reason = patch.reason !== undefined ? patch.reason : current.adjustment_reason ?? null;
      const note = patch.note !== undefined ? patch.note : current.adjustment_note ?? null;
      list[index] = {
        ...current,
        adjustment_reason: reason,
        // Een vrije toelichting hoort bij "Anders…"; bij een andere of lege keuze vervalt hij.
        adjustment_note: reason === "other" ? note : null,
      };
      return { ...base, [supplierId]: list };
    });
  };

  /** Aantal dat de suggestie voorstelde voor deze regel (0 = handmatig toegevoegd). */
  const suggestedQuantityForLine = (supplierId: string, lineKey: string): number => {
    const suggestedLines = autoOrderBySupplier[supplierId] ?? [];
    return suggestedLines.find((l) => orderLineKey(l) === lineKey)?.quantity ?? 0;
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
        // Wat het systeem adviseerde op verstuurmoment, plus de eventuele reden dat de
        // manager daarvan afweek. Valt terug op de actuele suggestie voor regels die
        // uit een ouder concept komen (toen nog zonder dit veld).
        suggested_base_qty:
          line.suggested_base_qty ?? baseSuggestedByRaw[line.raw_ingredient_id] ?? null,
        adjustment_reason: line.adjustment_reason ?? null,
        adjustment_note: line.adjustment_note ?? null,
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
      const supabase = createClient();

      // Zuidas verstuurde op 2026-09-01 vier keer dezelfde Van Gelder-order binnen 25 minuten;
      // elke klik was een echte, geslaagde verzending. Een tweede order op dezelfde dag is soms
      // legitiem (vergeten artikel), dus we blokkeren niet, maar we vragen het wel.
      if (!dryRun) {
        const { data: sentToday } = await supabase
          .from("orders")
          .select("id, created_at, order_dispatches!inner(status)")
          .eq("location_id", locationId)
          .eq("supplier_id", supplierId)
          .eq("order_date", orderDate)
          .eq("order_dispatches.status", "sent");
        if ((sentToday?.length ?? 0) > 0) {
          const supName = suppliers.find((s) => s.id === supplierId)?.name ?? "this supplier";
          const times = (sentToday ?? [])
            .map((o) => new Date((o as { created_at: string }).created_at))
            .sort((a, b) => a.getTime() - b.getTime())
            .map((d) => d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }))
            .join(", ");
          const ok = window.confirm(
            `An order was already sent to ${supName} today (${times}). ` +
              `Sending again creates a second, separate order — it does not replace the first one.\n\n` +
              `Send another order?`
          );
          if (!ok) {
            setDispatchStatusBySupplier((prev) => ({
              ...prev,
              [supplierId]: { loading: false, loadingAction: undefined, dryRun, message: "Not sent." },
            }));
            return;
          }
        }
      }

      const orderId = await createOrderForSupplier(supplierId, lines, orderDate);
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
                  {!isPlanning && (() => {
                    // Chips verschijnen pas als het aantal afwijkt van de suggestie, en
                    // blokkeren niets: bestellen kan gewoon zonder een reden te kiezen.
                    const suggestedQty = suggestedQuantityForLine(sup.id, lineKey);
                    if (line.quantity === suggestedQty) return null;
                    const reason = line.adjustment_reason ?? null;
                    return (
                      <div className="mt-1 flex w-full basis-full flex-wrap items-center gap-1.5">
                        <span className="text-xs text-ink-soft/70">
                          Why different? (optional)
                        </span>
                        {ADJUSTMENT_REASONS.map((opt) => {
                          const active = reason === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                updateLineAdjustment(sup.id, lineKey, {
                                  reason: active ? null : opt.value,
                                })
                              }
                              className={
                                active
                                  ? "rounded-full border border-brand-green bg-brand-green/10 px-2 py-0.5 text-xs font-medium text-brand-green"
                                  : "rounded-full border border-brand-green/20 bg-surface px-2 py-0.5 text-xs text-ink-soft hover:bg-brand-sand/40"
                              }
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                        {reason === "other" && (
                          <input
                            type="text"
                            value={line.adjustment_note ?? ""}
                            onChange={(e) =>
                              updateLineAdjustment(sup.id, lineKey, { note: e.target.value })
                            }
                            placeholder="Add a note"
                            aria-label={`Note for ${row.product}`}
                            className="min-w-[10rem] flex-1 rounded border border-brand-green/15 bg-surface px-2 py-0.5 text-xs text-ink"
                          />
                        )}
                      </div>
                    );
                  })()}
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
              disabled={anyLoading}
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
              disabled={anyLoading}
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
          <div className="flex items-center gap-3">
            <Link href="/ordering/history" className="text-sm font-medium text-ink-soft/80">
              History
            </Link>
            <Link href="/dashboard" className="text-sm font-medium text-ink-soft/80">
              Dashboard
            </Link>
          </div>
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
              {snapshotSaveError && (
                <span className="text-xs text-accent-terracotta font-medium">
                  {snapshotSaveError}
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
