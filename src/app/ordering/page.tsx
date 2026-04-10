"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ChickpeaSoakCallout } from "@/components/ChickpeaSoakCallout";
import { DailyWorkflowStepper } from "@/components/DailyWorkflowStepper";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import type { Supplier, RawIngredient, IngredientPackSize, PrepItem } from "@/lib/types";
import { buildYieldMetaForPrepItem, type PrepItemYieldMeta } from "@/lib/prepRecipeYield";
import {
  daysUntilNextDelivery,
  supplierScheduleDayToJsDay,
  aggregateDailyRawNeedFromPrep,
  suggestOrderBaseQuantities,
  baseAmountsToPackCounts,
  getBestPackSize,
  roundUpToMultiple,
  getRevenueMultiplier,
  calcNeededQuantity,
  type PrepItemIngredientRow,
} from "@/lib/calculations";
import { formatDecimal2, formatOrderAmount, formatPrepQuantity } from "@/lib/format";
import { localCalendarDateString } from "@/lib/date";
import { ensureEffectiveDailyRevenueTargetCents } from "@/lib/revenueTarget";
import { soakDryChickpeasKgFromPrepState } from "@/lib/chickpeaSoakPrepNeed";
import {
  basePerOneStocktakeInputUnit,
  packSizeToBaseAmount,
  stocktakeOrderUnitLabel,
} from "@/lib/stocktakeRawPackMath";

type DeliverySchedule = { supplier_id: string; day_of_week: number };

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

/** Card order: Java bakery → Van Gelder → Bidfood → others (A–Z). */
const SUPPLIER_CARD_PRIORITY = ["java bakery", "van gelder", "bidfood"] as const;

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

/** Supplier has no fixed weekday in schedule — order when needed. */
function isOnDemandSupplierName(name: string): boolean {
  const n = name.toLowerCase().trim();
  return n === "tuana" || n === "today food group";
}

function nextDeliveryLabel(supplierName: string, days: number): string {
  if (isOnDemandSupplierName(supplierName)) {
    return "No fixed delivery day — order when you need stock";
  }
  if (days === 0) return "Next delivery: today";
  if (days === 1) return "Next delivery: tomorrow";
  return `Next delivery: in ${days} days`;
}

function buildOrderLinesFromSuggestion(
  suggestedOrder: Record<string, number>,
  suggestionSupplierByRaw: Record<string, string | null>,
  rawIngredients: RawIngredient[],
  packSizesByIngredient: Record<string, IngredientPackSize[]>,
  orderKindByRaw: Record<string, SuggestionOrderKind>
): Record<string, OrderLine[]> {
  const next: Record<string, OrderLine[]> = {};
  for (const [rawId, qty] of Object.entries(suggestedOrder)) {
    if (qty <= 0) continue;
    const supplierId = suggestionSupplierByRaw[rawId];
    if (!supplierId) continue;
    const ing = rawIngredients.find((r) => r.id === rawId);
    if (!ing) continue;
    const allPacks = packSizesByIngredient[rawId] ?? [];
    const packs = packsForOrder(allPacks);
    const best = getBestPackSize(packs);
    const kind = orderKindByRaw[rawId] ?? "pack";

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
  return next;
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
  const bestPack =
    kind === "pack"
      ? getBestPackSize(forOrder) ?? (allPacks.length > 0 ? getBestPackSize(allPacks) : null)
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
  const { locationId, locationOptions } = useLocation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [schedules, setSchedules] = useState<DeliverySchedule[]>([]);
  const [rawIngredients, setRawIngredients] = useState<RawIngredient[]>([]);
  const [packSizes, setPackSizes] = useState<IngredientPackSize[]>([]);
  /** Packs loaded in a follow-up query when nested raw→packs omits rows PostgREST caps. */
  const [supplementalPackSizes, setSupplementalPackSizes] = useState<IngredientPackSize[]>([]);
  const [orderBySupplier, setOrderBySupplier] = useState<Record<string, OrderLine[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [suggestedOrder, setSuggestedOrder] = useState<Record<string, number>>({});
  /** Preferred supplier per raw for the current suggestion. */
  const [suggestionSupplierByRaw, setSuggestionSupplierByRaw] = useState<Record<string, string | null>>({});
  /** Per raw: pack / stocktake / recipe units when there is no order pack line. */
  const [suggestionOrderKindByRaw, setSuggestionOrderKindByRaw] = useState<
    Record<string, SuggestionOrderKind>
  >({});
  const [suggestedUnassignedRawIds, setSuggestedUnassignedRawIds] = useState<string[]>([]);
  /** Set when suggestion queries fail (RLS/network) so the page is not silently empty. */
  const [suggestionLoadError, setSuggestionLoadError] = useState<string | null>(null);
  /** Why the suggestion is empty / what was loaded (local date + counts). */
  /** Same rule as Dashboard: every location prep row has a count row for today (local date). */
  const [prepStocktakeComplete, setPrepStocktakeComplete] = useState(false);
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
    revenueMultiplier: number;
    /** Lines after conversion to order packs (can be 0 while need &gt; 0). */
    packConversionLineCount: number;
    /** Lines without order packs: stocktake and/or recipe units. */
    baseFallbackLineCount: number;
  } | null>(null);

  useEffect(() => {
    if (!locationId) {
      setSuppliers([]);
      setSchedules([]);
      setRawIngredients([]);
      setPackSizes([]);
      setSupplementalPackSizes([]);
      setOrderBySupplier({});
      setSuggestionOrderKindByRaw({});
      setLoading(false);
      return;
    }
    setSupplementalPackSizes([]);
    setLoading(true);
    const supabase = createClient();

    // Embed packs on each raw row (avoids .in() limits / default row caps on a separate query).
    Promise.all([
      supabase.from("suppliers").select("id, name, location_id").eq("location_id", locationId).order("name"),
      supabase.from("supplier_delivery_schedules").select("supplier_id, day_of_week").eq("location_id", locationId),
      supabase
        .from("raw_ingredients")
        .select(
          `id, name, unit, location_id, order_interval_days,
          stocktake_unit_label, stocktake_content_amount, stocktake_content_unit,
          ingredient_pack_sizes (
            id, raw_ingredient_id, size, size_unit, price_cents, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple
          )`
        )
        .eq("location_id", locationId)
        .order("name"),
    ])
      .then(async ([sRes, schRes, rRes]) => {
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

        setSuppliers((sRes.data as Supplier[]) ?? []);
        setSchedules((schRes.data as DeliverySchedule[]) ?? []);
        setRawIngredients(rawList);
        setPackSizes(Array.from(dedupe.values()));
        setOrderBySupplier({});
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setSuppliers([]);
        setSchedules([]);
        setRawIngredients([]);
        setPackSizes([]);
      })
      .finally(() => setLoading(false));
  }, [locationId]);

  // Load prep-based suggestion: daily need × cover until delivery *after* the next one (+ evening) − stock → packs
  useEffect(() => {
    if (!locationId || rawIngredients.length === 0) {
      setPrepStocktakeComplete(false);
      setSuggestedOrder({});
      setSuggestionSupplierByRaw({});
      setSuggestionOrderKindByRaw({});
      setSuggestedUnassignedRawIds([]);
      setSuggestionLoadError(null);
      setSuggestionInsight(null);
      setSupplementalPackSizes([]);
      return;
    }
    const d = localCalendarDateString();
    const rawIds = new Set(rawIngredients.map((r) => r.id));
    const rawIdList = Array.from(rawIds);
    const supabase = createClient();
    const todayForCover = new Date(`${d}T12:00:00`);

    /** Avoids setState / pack fetch after unmount or React Strict Mode re-run (stale async). */
    let alive = true;
    void (async () => {
      const lpiRes = await supabase
        .from("location_prep_items")
        .select(
          "prep_item_id, base_quantity, prep_items(id, batch_size, content_amount, content_unit, recipe_output_amount, recipe_output_unit, ingredient_qty_is_per_recipe_batch)"
        )
        .eq("location_id", locationId);
      if (!alive) return;
      if (lpiRes.error) {
        setPrepStocktakeComplete(false);
        setSuggestedOrder({});
        setSuggestionSupplierByRaw({});
        setSuggestionOrderKindByRaw({});
        setSuggestedUnassignedRawIds([]);
        setSupplementalPackSizes([]);
        setSuggestionLoadError(String(lpiRes.error.message));
        setSuggestionInsight(null);
        return;
      }
      const lpi =
        (lpiRes.data as unknown as {
          prep_item_id: string;
          base_quantity?: number | null;
          prep_items: PrepItem | null;
        }[]) ?? [];
      const prepYieldByPrepItemId: Record<string, PrepItemYieldMeta> = {};
      for (const row of lpi) {
        const p = row.prep_items;
        if (p?.id) prepYieldByPrepItemId[p.id] = buildYieldMetaForPrepItem(p);
      }
      const prepIdsAtLocation = [...new Set(lpi.map((row) => row.prep_item_id))];

      const [revCents, locRes, recipeRes, stockRes, supRes, siRes, prepCountRes] = await Promise.all([
        ensureEffectiveDailyRevenueTargetCents(supabase, locationId, d),
        supabase
          .from("locations")
          .select("full_capacity_revenue, ordering_evening_day_fraction")
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
          .select("raw_ingredient_id, quantity")
          .eq("location_id", locationId)
          .eq("date", d),
        supabase.from("suppliers").select("id").eq("location_id", locationId),
        supabase
          .from("supplier_ingredients")
          .select("supplier_id, raw_ingredient_id, is_preferred")
          .in("raw_ingredient_id", rawIdList),
        supabase
          .from("daily_prep_counts")
          .select("id", { count: "exact", head: true })
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
        siRes.error;
      if (err) {
        setPrepStocktakeComplete(false);
        setSuggestedOrder({});
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
        return;
      }
      setSuggestionLoadError(null);

      const loc = locRes.data as {
        full_capacity_revenue?: number | null;
        ordering_evening_day_fraction?: number | null;
      } | null;
      const recipes = (recipeRes.data as PrepItemIngredientRow[]) ?? [];
      const stockList = (stockRes.data as { raw_ingredient_id: string; quantity: number }[]) ?? [];
      const currentStock = Object.fromEntries(stockList.map((s) => [s.raw_ingredient_id, Number(s.quantity)]));
      const revenueMultiplier = getRevenueMultiplier({
        todayRevenueCents: revCents,
        fullCapacityRevenue: loc?.full_capacity_revenue ?? null,
      });
      const neededByPrepItemId: Record<string, number> = {};
      for (const row of lpi) {
        const prep = row.prep_items;
        if (!prep) continue;
        const baseQty = row.base_quantity ?? 1;
        neededByPrepItemId[row.prep_item_id] = calcNeededQuantity({
          baseQuantity: baseQty,
          revenueMultiplier,
        });
      }
      const locationPrepIds = new Set(lpi.map((row) => row.prep_item_id));
      const recipeFiltered = recipes.filter(
        (r) => rawIds.has(r.raw_ingredient_id) && locationPrepIds.has(r.prep_item_id)
      );
      const dailyRawNeed = aggregateDailyRawNeedFromPrep({
        neededByPrepItemId,
        prepItemIngredients: recipeFiltered,
        prepYieldByPrepItemId,
      });
      const locationSupplierIds = new Set(
        ((supRes.data as { id: string }[]) ?? []).map((s) => s.id)
      );
      const siRows =
        (siRes.data as { supplier_id: string; raw_ingredient_id: string; is_preferred: boolean }[]) ?? [];
      const byRaw: Record<string, { supplier_id: string; is_preferred: boolean }[]> = {};
      for (const r of siRows) {
        if (!locationSupplierIds.has(r.supplier_id)) continue;
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
      const baseSuggested = suggestOrderBaseQuantities({
        today: todayForCover,
        dailyRawNeed,
        currentRawStock: currentStock,
        preferredSupplierByRawId,
        schedulesBySupplierJs,
        orderIntervalDaysByRawId,
        orderingEveningDayFraction: loc?.ordering_evening_day_fraction,
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
          `id,
          ingredient_pack_sizes (
            id, raw_ingredient_id, size, size_unit, price_cents, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple
          )`
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
        let best = getBestPackSize(forOrder);
        if (!best && list.length > 0) best = getBestPackSize(list);
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
        const pc = packCounts[rid];
        if (pc != null && pc > 0) {
          const entry = packAndUnitByRawId[rid];
          const mult = entry?.pack?.order_pack_multiple ?? 1;
          finalSuggested[rid] = roundUpToMultiple(pc, mult);
          kindByRaw[rid] = "pack";
          continue;
        }
        const ing = rawIngredients.find((r) => r.id === rid);
        const mergedPacks = packsForRawMerged(rid);
        const bps = ing ? basePerOneStocktakeInputUnit(ing, mergedPacks) : null;
        if (bps != null && bps > 0) {
          finalSuggested[rid] = Math.max(1, Math.ceil(baseAmt / bps));
          kindByRaw[rid] = "stocktake";
        } else {
          finalSuggested[rid] = Math.max(1, Math.ceil(baseAmt));
          kindByRaw[rid] = "recipe";
        }
      }
      const suppressSupplierIds = new Set(
        suppliers.filter((s) => isOnDemandSupplierName(s.name)).map((s) => s.id)
      );
      let suggestedForUi: Record<string, number> = { ...finalSuggested };
      let kindForUi: Record<string, SuggestionOrderKind> = { ...kindByRaw };
      if (!prepComplete) {
        for (const rid of Object.keys(suggestedForUi)) {
          const sid = preferredSupplierByRawId[rid];
          if (sid && suppressSupplierIds.has(sid)) {
            delete suggestedForUi[rid];
            delete kindForUi[rid];
          }
        }
      }
      const suggestionLineCount = Object.keys(suggestedForUi).length;
      const packConversionLineCount = Object.values(kindForUi).filter((k) => k === "pack").length;
      const baseFallbackLineCount = Object.values(kindForUi).filter(
        (k) => k === "stocktake" || k === "recipe"
      ).length;
      const unassigned: string[] = [];
      for (const rawId of Object.keys(baseSuggested)) {
        if (!preferredSupplierByRawId[rawId]) unassigned.push(rawId);
      }
      const dailyRawNeedSum = Object.values(dailyRawNeed).reduce((a, b) => a + b, 0);
      const baseOrderNeedSum = Object.values(baseSuggested).reduce((a, b) => a + b, 0);
      if (!alive) return;
      setSupplementalPackSizes(supplementalPacks);
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
        stockRowsForDate: stockList.length,
        revenueMultiplier,
        packConversionLineCount,
        baseFallbackLineCount,
      });
    })().catch(() => {
      if (!alive) return;
      setPrepStocktakeComplete(false);
      setSuggestedOrder({});
      setSuggestionSupplierByRaw({});
      setSuggestionOrderKindByRaw({});
      setSuggestedUnassignedRawIds([]);
      setSupplementalPackSizes([]);
      setSuggestionLoadError("Could not load order suggestion.");
      setSuggestionInsight(null);
    });

    return () => {
      alive = false;
    };
  }, [locationId, rawIngredients, schedules, packSizes, suppliers]);

  const onDemandSupplierIdSet = useMemo(
    () => new Set(suppliers.filter((s) => isOnDemandSupplierName(s.name)).map((s) => s.id)),
    [suppliers]
  );

  useEffect(() => {
    if (prepStocktakeComplete || onDemandSupplierIdSet.size === 0) return;
    setOrderBySupplier((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const sid of onDemandSupplierIdSet) {
        if (next[sid]?.length) {
          delete next[sid];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [prepStocktakeComplete, onDemandSupplierIdSet, orderBySupplier]);

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

  const daysUntil = (supplierId: string) =>
    daysUntilNextDelivery({
      today: new Date(),
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

  /**
   * When order lines are empty, fill supplier cards from the computed suggestion (including when
   * supplemental pack rows load later). Does not overwrite lines once the user has any lines.
   */
  useEffect(() => {
    if (!locationId) return;
    const anyLines = Object.values(orderBySupplier).some((a) => a.length > 0);
    if (anyLines) return;
    if (Object.keys(suggestedOrder).length === 0) return;
    const hasAssignable = Object.entries(suggestedOrder).some(
      ([rid, q]) => q > 0 && suggestionSupplierByRaw[rid]
    );
    if (!hasAssignable) return;
    const next = buildOrderLinesFromSuggestion(
      suggestedOrder,
      suggestionSupplierByRaw,
      rawIngredients,
      packSizesByIngredient,
      suggestionOrderKindByRaw
    );
    if (Object.keys(next).length === 0) return;
    setOrderBySupplier(next);
  }, [
    locationId,
    orderBySupplier,
    suggestedOrder,
    suggestionSupplierByRaw,
    suggestionOrderKindByRaw,
    rawIngredients,
    packSizesByIngredient,
  ]);

  const removeLine = (supplierId: string, index: number) => {
    setOrderBySupplier((prev) => {
      const list = (prev[supplierId] ?? []).filter((_, i) => i !== index);
      if (list.length === 0) {
        const next = { ...prev };
        delete next[supplierId];
        return next;
      }
      return { ...prev, [supplierId]: list };
    });
  };

  const confirmOrder = async () => {
    if (!locationId) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const orderDate = localCalendarDateString();

    try {
      for (const [supplierId, lines] of Object.entries(orderBySupplier)) {
        if (lines.length === 0) continue;
        if (!prepStocktakeComplete && onDemandSupplierIdSet.has(supplierId)) continue;
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
      }
      setSubmitted(true);
      setOrderBySupplier({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit order");
    } finally {
      setSubmitting(false);
    }
  };

  const hasAnyLines = useMemo(() => {
    return Object.entries(orderBySupplier).some(([supplierId, arr]) => {
      if (arr.length === 0) return false;
      if (!prepStocktakeComplete && onDemandSupplierIdSet.has(supplierId)) return false;
      return true;
    });
  }, [orderBySupplier, prepStocktakeComplete, onDemandSupplierIdSet]);

  const locationName = locationOptions.find((l) => l.id === locationId)?.name ?? "";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-28 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-2xl">
            Ordering
          </h1>
          <Link href="/dashboard" className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Dashboard
          </Link>
        </div>

        <DailyWorkflowStepper />

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {submitted && (
          <div className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
            Orders submitted successfully.
          </div>
        )}

        {suggestionLoadError && (
          <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            Failed to load order suggestion: {suggestionLoadError}
          </div>
        )}

        {locationName && (
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Order for: <strong>{locationName}</strong>
            <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-500">
              Each card lists items for that supplier from Admin (supplier ingredients). You see product, amount, and
              unit — adjust mappings in Admin if something is wrong. Confirm once to save orders in the app.
            </span>
          </p>
        )}

        <ChickpeaSoakCallout kg={soakDryChickpeasKg} />

        {suggestedUnassignedRawIds.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
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
            <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-100/60 p-4 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">No automatic suggestion</p>
              <p className="mt-2 text-xs leading-relaxed">
                The suggestion uses <strong>prep need × cover window − stock</strong> (not stocktake alone). Below is what
                loaded for date <strong>{suggestionInsight.dateUsed}</strong> (local date on this device — same calendar
                day you should use for stocktake).
              </p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                <strong>Note:</strong> for the &quot;− stock&quot; term this page only uses{" "}
                <strong>raw-ingredient counts</strong> (section 2 /{" "}
                <code className="text-[11px]">daily_stock_counts</code>), not finished prep from section 1 alone. If you
                only count prep products, raw stock rows here stay 0.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                <strong>Order packs vs stocktake:</strong> the app first computes need in <strong>base units</strong> (as
                on recipes). With an <strong>order pack</strong> (<code className="text-[11px]">ingredient_pack_sizes</code>
                ) that converts to order packs. <strong>Without order packs</strong> it falls back to the same{" "}
                <strong>stocktake unit</strong> as on the count (master B/C/D or stocktake-pack), often the ordering
                unit. Only if that is missing does it round in <strong>recipe units</strong>.
              </p>
              <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                <li>Raw ingredients for location in app: {suggestionInsight.locationRawCount}</li>
                <li>Prep products linked to location: {suggestionInsight.prepLinkedCount}</li>
                <li>Recipe rows (prep → raw) for those preps: {suggestionInsight.recipeRowsForLocation}</li>
                <li>Sum of daily raw need (recipe): {formatDecimal2(suggestionInsight.dailyRawNeedSum)}</li>
                <li>Order need in base units after cover: {formatDecimal2(suggestionInsight.baseOrderNeedSum)}</li>
                <li>Stock rows on this date: {suggestionInsight.stockRowsForDate}</li>
                <li>Revenue multiplier: {formatPrepQuantity(suggestionInsight.revenueMultiplier)}</li>
                <li>
                  Suggestion lines (total): {suggestionInsight.suggestionLineCount} — converted to order packs:{" "}
                  {suggestionInsight.packConversionLineCount}, without packs (stocktake/recipe):{" "}
                  {suggestionInsight.baseFallbackLineCount}
                </li>
                <li>Pack rows loaded from DB for this suggestion: {suggestionInsight.packRowsLoadedFromDb}</li>
              </ul>
              {suggestionInsight.packFetchError && (
                <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">
                  Pack query partially failed: {suggestionInsight.packFetchError}
                </p>
              )}
              {suggestionInsight.stockRowsForDate === 0 && (
                <p className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-200">
                  There are no stock counts in the database for {suggestionInsight.dateUsed}. Check that stocktake was
                  saved on the <strong>same calendar day</strong> (the app used to use UTC midnight — that can be off by
                  one day).
                </p>
              )}
              {suggestionInsight.prepLinkedCount > 0 && suggestionInsight.recipeRowsForLocation === 0 && (
                <p className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-200">
                  No recipe rows are linked to this location&apos;s prep products. Fill{" "}
                  <strong>prep_item_ingredients</strong> (Admin / import).
                </p>
              )}
              {suggestionInsight.recipeRowsForLocation > 0 &&
                suggestionInsight.dailyRawNeedSum <= 0 &&
                suggestionInsight.prepLinkedCount > 0 && (
                  <p className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-200">
                    Daily need is 0 (e.g. revenue target = 0 or missing revenue row while full capacity is set). With no
                    revenue target for today we plan with multiplier 1.
                  </p>
                )}
              {suggestionInsight.baseOrderNeedSum <= 0 &&
                suggestionInsight.dailyRawNeedSum > 0 &&
                suggestionInsight.stockRowsForDate > 0 && (
                  <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
                    On this calculation, entered stock covers need until after the next delivery (or there is no
                    shortfall in base units).
                  </p>
                )}
              {suggestionInsight.baseOrderNeedSum > 0 && suggestionInsight.suggestionLineCount === 0 && (
                <p className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-200">
                  There is calculated need in base units but no suggestion lines (e.g. no raws linked to suppliers in
                  Admin → supplier ingredients).
                </p>
              )}
              {suggestionInsight.baseOrderNeedSum > 0 &&
                suggestionInsight.suggestionLineCount > 0 &&
                suggestionInsight.baseFallbackLineCount > 0 && (
                  <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
                    {suggestionInsight.packRowsLoadedFromDb === 0
                      ? "Tip: no order pack rows yet — the app uses stocktake units (B/C/D) or recipe units where possible. Add ingredient_pack_sizes for order packs and pricing."
                      : "Some raws are missing a valid order pack — those lines use stocktake or recipe units. Check Admin → pack sizes (size &gt; 0, order/both)."}
                  </p>
                )}
            </div>
          )}

        {loading ? (
          <p className="py-8 text-zinc-500">Loading…</p>
        ) : !locationId ? (
          <p className="py-8 text-zinc-500">Select a location.</p>
        ) : suppliers.length === 0 ? (
          <p className="py-8 text-zinc-500">No suppliers for this location. Add them in Admin → Suppliers.</p>
        ) : (
          <div className="mt-6 space-y-8">
            {sortedSuppliers.map((sup) => {
              const days = daysUntil(sup.id);
              const suppressedCard =
                !prepStocktakeComplete && isOnDemandSupplierName(sup.name);
              const lines = orderBySupplier[sup.id] ?? [];
              const suggestedForSup = Object.entries(suggestedOrder).filter(
                ([rawId, qty]) => qty > 0 && suggestionSupplierByRaw[rawId] === sup.id
              );
              const hasOrderWork =
                !suppressedCard && (lines.length > 0 || suggestedForSup.length > 0);
              const linesToShow = suppressedCard ? [] : lines;

              return (
                <section
                  key={sup.id}
                  className={
                    hasOrderWork
                      ? "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
                      : "rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-600 dark:bg-zinc-900/60"
                  }
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2
                      className={
                        hasOrderWork
                          ? "font-semibold text-zinc-900 dark:text-zinc-100"
                          : "font-medium text-zinc-500 dark:text-zinc-400"
                      }
                    >
                      {sup.name}
                    </h2>
                    <span
                      className={
                        hasOrderWork
                          ? "text-sm text-zinc-500 dark:text-zinc-400"
                          : "text-sm text-zinc-400 dark:text-zinc-500"
                      }
                    >
                      {nextDeliveryLabel(sup.name, days)}
                    </span>
                  </div>
                  {!hasOrderWork && (
                    <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-500">
                      No order suggestion and no lines — nothing to do here for now.
                    </p>
                  )}

                  <ul className="space-y-2">
                    {linesToShow.map((line, idx) => {
                      const ing = rawIngredients.find((r) => r.id === line.raw_ingredient_id);
                      const kind = suggestionOrderKindByRaw[line.raw_ingredient_id] ?? "pack";
                      const row = orderLineRowView(
                        line,
                        kind,
                        ing,
                        packSizesByIngredient[line.raw_ingredient_id] ?? []
                      );
                      return (
                        <li
                          key={`${sup.id}-${line.raw_ingredient_id}-${idx}`}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900/50"
                        >
                          <span className="min-w-[7rem] flex-1 font-medium text-zinc-900 dark:text-zinc-100">
                            {row.product}
                          </span>
                          <span className="w-14 shrink-0 tabular-nums text-zinc-800 dark:text-zinc-200">
                            {row.countTimes}
                          </span>
                          <span className="min-w-[6rem] flex-1 text-zinc-700 dark:text-zinc-300">
                            {row.packType}
                          </span>
                          <span className="w-24 shrink-0 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                            {row.totalLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeLine(sup.id, idx)}
                            className="shrink-0 rounded-lg border border-red-200 px-2 py-1.5 text-xs text-red-600 dark:border-red-800 dark:text-red-400"
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {hasAnyLines && (
          <div className="mt-8">
            <button
              type="button"
              onClick={confirmOrder}
              disabled={submitting}
              className="w-full rounded-xl bg-zinc-900 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {submitting ? "Submitting…" : "Confirm order"}
            </button>
          </div>
        )}

        <div className="mt-8 flex gap-4">
          <Link href="/prep-list" className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            ← Prep List
          </Link>
          <Link href="/admin" className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Admin →
          </Link>
        </div>
      </main>
    </div>
  );
}
