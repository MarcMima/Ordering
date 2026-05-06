"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { TopNav } from "@/components/TopNav";
import { DailyWorkflowStepper } from "@/components/DailyWorkflowStepper";
import { SortableStocktakeItem } from "@/components/stocktake/SortableStocktakeItem";
import { StocktakeRawRow } from "@/components/stocktake/StocktakeRawRow";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import { localCalendarDateString } from "@/lib/date";
import { ensureEffectiveDailyRevenueTargetCents } from "@/lib/revenueTarget";
import type { IngredientPackSize, PrepItem, RawIngredient } from "@/lib/types";
import {
  isRawDeliverableTomorrow,
  supplierScheduleDayToJsDay,
} from "@/lib/calculations";
import { formatDecimal2 } from "@/lib/format";

type StocktakeDeliveryMeta = {
  schedules: { supplier_id: string; day_of_week: number }[];
  supplierIds: string[];
  supplierIngredients: {
    supplier_id: string;
    raw_ingredient_id: string;
    is_preferred: boolean;
  }[];
  /** When true, show all daily raws (delivery filter could not be loaded). */
  skipFilter?: boolean;
};

type LocationPrepItem = {
  id: string;
  location_id: string;
  prep_item_id: string;
  display_order?: number | null;
  prep_items: PrepItem | null;
};

/** Master I: hidden when false. */
function isVisibleOnStocktakeList(ing: RawIngredient): boolean {
  return ing.stocktake_visible !== false;
}

/** Weekly bucket: master J → stocktake_day_of_week set (0–6). Daily = null/undefined. */
function isWeeklyStocktakeItem(ing: RawIngredient): boolean {
  const sd = ing.stocktake_day_of_week;
  return sd != null && Number(sd) >= 0 && Number(sd) <= 6;
}

function sortRawStocktakeList(list: RawIngredient[]): RawIngredient[] {
  return [...list].sort((a, b) => {
    const oa = a.stocktake_display_order ?? 0;
    const ob = b.stocktake_display_order ?? 0;
    if (oa !== ob) return oa - ob;
    return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
  });
}

/** Apply a new id order for one daily/weekly tab onto the full visible-raw list. */
function reorderRawListByIds(
  prevAll: RawIngredient[],
  tab: "daily" | "weekly",
  orderedTabIds: string[]
): { next: RawIngredient[]; updates: { id: string; stocktake_display_order: number }[] } {
  const orderMap = Object.fromEntries(orderedTabIds.map((id, i) => [id, i * 10]));
  const next = prevAll.map((r) =>
    orderMap[r.id] !== undefined ? { ...r, stocktake_display_order: orderMap[r.id]! } : r
  );
  const updates = orderedTabIds.map((id, i) => ({ id, stocktake_display_order: i * 10 }));
  return { next, updates };
}

function PrepCountField({
  prepItemId,
  quantity,
  onCommit,
  onClear,
  isSaving,
  label,
}: {
  prepItemId: string;
  quantity: number | undefined;
  onCommit: (prepItemId: string, n: number) => void;
  onClear: (prepItemId: string) => void;
  isSaving: boolean;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display =
    draft !== null
      ? draft
      : quantity === undefined
        ? ""
        : formatDecimal2(quantity);

  return (
    <div className="flex items-center gap-3">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="—"
        value={display}
        onFocus={() => setDraft(quantity === undefined ? "" : formatDecimal2(quantity))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          const raw = e.currentTarget.value.trim().replace(",", ".");
          setDraft(null);
          if (raw === "" || raw === ".") {
            onClear(prepItemId);
            return;
          }
          const n = parseFloat(raw);
          onCommit(prepItemId, !Number.isFinite(n) || n < 0 ? 0 : n);
        }}
        className="h-16 w-full min-h-[56px] min-w-[140px] max-w-[180px] rounded-xl border border-zinc-300 bg-zinc-50 px-4 text-xl font-medium tabular-nums touch-manipulation dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        aria-label={`Count for ${label}`}
      />
      {isSaving && <span className="text-xs text-zinc-400">Saving</span>}
    </div>
  );
}

export default function StocktakePage() {
  const router = useRouter();
  const { locationId } = useLocation();
  const [date] = useState(() => localCalendarDateString());
  const [expectedRevenue, setExpectedRevenue] = useState("");
  const [revenueSaving, setRevenueSaving] = useState(false);
  const [locationPrepItems, setLocationPrepItems] = useState<LocationPrepItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countSaving, setCountSaving] = useState<Record<string, boolean>>({});
  /** All raws visible on stocktake (daily + weekly); split in UI by tab. */
  const [allVisibleRaws, setAllVisibleRaws] = useState<RawIngredient[]>([]);
  const [packSizes, setPackSizes] = useState<IngredientPackSize[]>([]);
  const [rawCounts, setRawCounts] = useState<Record<string, number>>({});
  const [rawCountSaving, setRawCountSaving] = useState<Record<string, boolean>>({});
  const [rawSubtab, setRawSubtab] = useState<"daily" | "weekly">("daily");
  const [prepReorderMode, setPrepReorderMode] = useState(false);
  const [prepOrderSaving, setPrepOrderSaving] = useState(false);
  const prepOrderPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rawReorderMode, setRawReorderMode] = useState(false);
  const [rawOrderSaving, setRawOrderSaving] = useState(false);
  const rawOrderPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stocktakeDeliveryMeta, setStocktakeDeliveryMeta] = useState<StocktakeDeliveryMeta | null>(
    null
  );
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);

  const STOCKTAKE_LEAVE_INCOMPLETE_MSG =
    "Stocktake is nog niet compleet (finished products en/of raw ingredients). Toch doorgaan naar de volgende stap?";

  useEffect(() => {
    if (showOnlyMissing) {
      setPrepReorderMode(false);
      setRawReorderMode(false);
    }
  }, [showOnlyMissing]);

  // Load prep items + prep counts + raw ingredients + raw stock counts
  useEffect(() => {
    if (!locationId) {
      setLocationPrepItems([]);
      setCounts({});
      setAllVisibleRaws([]);
      setRawCounts({});
      setStocktakeDeliveryMeta(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setStocktakeDeliveryMeta(null);
    const supabase = createClient();
    const d = date || localCalendarDateString();

    // High limit so PostgREST default (1000) never hides rows after bulk import
    const maxRows = 10000;

    // Embed pack sizes on each raw row so we never miss rows (global .limit / huge .in() lists
    // can omit packs → UI falls back to flat g/ml/pcs).
    Promise.all([
      supabase
        .from("location_prep_items")
        .select("id, location_id, prep_item_id, display_order, prep_items(*)")
        .eq("location_id", locationId)
        .order("display_order")
        .order("prep_item_id")
        .limit(maxRows),
      supabase
        .from("daily_prep_counts")
        .select("prep_item_id, quantity")
        .eq("location_id", locationId)
        .eq("date", d)
        .limit(maxRows),
      supabase
        .from("raw_ingredients")
        .select(
          `id, name, unit, location_id, stocktake_visible, stocktake_day_of_week,
          stocktake_display_order,
          stocktake_unit_label, stocktake_content_amount, stocktake_content_unit,
          ingredient_pack_sizes (
            id, raw_ingredient_id, size, size_unit, grams_per_piece, pack_purpose, display_unit_label, price_cents, order_pack_multiple
          )`
        )
        .eq("location_id", locationId)
        .order("stocktake_display_order", { ascending: true })
        .order("name")
        .limit(maxRows),
      supabase
        .from("daily_stock_counts")
        .select("raw_ingredient_id, quantity")
        .eq("location_id", locationId)
        .eq("date", d)
        .limit(maxRows),
    ])
      .then(async ([lpiRes, prepCountRes, rawRes, stockRes]) => {
        if (lpiRes.error) throw new Error(String(lpiRes.error.message));
        if (prepCountRes.error) throw new Error(String(prepCountRes.error.message));
        if (rawRes.error) throw new Error(String(rawRes.error.message));
        if (stockRes.error) throw new Error(String(stockRes.error.message));
        const rawItems = (lpiRes.data as unknown) as (Omit<LocationPrepItem, "prep_items"> & { prep_items: PrepItem | PrepItem[] | null })[];
        let items: LocationPrepItem[] = (rawItems ?? []).map((row) => ({
          ...row,
          prep_items: Array.isArray(row.prep_items) ? row.prep_items[0] ?? null : row.prep_items,
        }));
        // Drop broken joins; sort by product name for a stable list
        items = items
          .filter((row) => row.prep_items != null)
          .sort((a, b) => {
            const oa = a.display_order ?? 0;
            const ob = b.display_order ?? 0;
            if (oa !== ob) return oa - ob;
            return (a.prep_items!.name || "").localeCompare(b.prep_items!.name || "", undefined, {
              sensitivity: "base",
            });
          });
        const prepCountList = (prepCountRes.data as { prep_item_id: string; quantity: number }[]) ?? [];
        const stockList = (stockRes.data as { raw_ingredient_id: string; quantity: number }[]) ?? [];
        type RawWithPacks = RawIngredient & {
          ingredient_pack_sizes?: IngredientPackSize[] | IngredientPackSize | null;
        };
        const rawRows = (rawRes.data as RawWithPacks[]) ?? [];
        const rawList: RawIngredient[] = [];
        const packs: IngredientPackSize[] = [];
        for (const row of rawRows) {
          const { ingredient_pack_sizes: nested, ...ing } = row;
          rawList.push(ing);
          const list = Array.isArray(nested) ? nested : nested != null ? [nested] : [];
          for (const p of list) packs.push(p);
        }
        const visibleRaws = rawList.filter((ing) => isVisibleOnStocktakeList(ing));
        const shownIds = new Set(visibleRaws.map((r) => r.id));
        const packsForList = packs.filter((p) => shownIds.has(p.raw_ingredient_id));
        const rawIds = visibleRaws.map((r) => r.id);
        let deliveryMeta: StocktakeDeliveryMeta = {
          schedules: [],
          supplierIds: [],
          supplierIngredients: [],
          skipFilter: true,
        };
        if (rawIds.length > 0) {
          try {
            const [schRes, supRes, siRes] = await Promise.all([
              supabase
                .from("supplier_delivery_schedules")
                .select("supplier_id, day_of_week")
                .eq("location_id", locationId),
              supabase.from("suppliers").select("id").eq("location_id", locationId),
              supabase
                .from("supplier_ingredients")
                .select("supplier_id, raw_ingredient_id, is_preferred")
                .in("raw_ingredient_id", rawIds),
            ]);
            if (schRes.error) throw schRes.error;
            if (supRes.error) throw supRes.error;
            if (siRes.error) throw siRes.error;
            deliveryMeta = {
              schedules: (schRes.data as { supplier_id: string; day_of_week: number }[]) ?? [],
              supplierIds: ((supRes.data as { id: string }[]) ?? []).map((s) => s.id),
              supplierIngredients:
                (siRes.data as {
                  supplier_id: string;
                  raw_ingredient_id: string;
                  is_preferred: boolean;
                }[]) ?? [],
              skipFilter: false,
            };
          } catch {
            deliveryMeta = {
              schedules: [],
              supplierIds: [],
              supplierIngredients: [],
              skipFilter: true,
            };
          }
        } else {
          deliveryMeta = {
            schedules: [],
            supplierIds: [],
            supplierIngredients: [],
            skipFilter: false,
          };
        }
        setStocktakeDeliveryMeta(deliveryMeta);
        setLocationPrepItems(items);
        setCounts(Object.fromEntries(prepCountList.map((c) => [c.prep_item_id, Number(c.quantity)])));
        setAllVisibleRaws(visibleRaws);
        setPackSizes(packsForList);
        setRawCounts(Object.fromEntries(stockList.map((s) => [s.raw_ingredient_id, Number(s.quantity)])));
        setError(null);
      })
      .catch((e) => {
        setLocationPrepItems([]);
        setCounts({});
        setAllVisibleRaws([]);
        setPackSizes([]);
        setRawCounts({});
        setStocktakeDeliveryMeta(null);
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [locationId, date]);

  // Load expected revenue for this location + date (carries forward last entered value)
  useEffect(() => {
    if (!locationId || !date) return;
    const supabase = createClient();
    void ensureEffectiveDailyRevenueTargetCents(supabase, locationId, date).then((cents) => {
      if (cents != null) setExpectedRevenue(String(cents / 100));
      else setExpectedRevenue("");
    });
  }, [locationId, date]);

  const saveRevenue = useCallback(() => {
    if (!locationId || !date) return;
    const cents = expectedRevenue.trim() ? Math.round(parseFloat(expectedRevenue) * 100) : 0;
    setRevenueSaving(true);
    const supabase = createClient();
    void supabase
      .from("daily_revenue_targets")
      .upsert(
        { location_id: locationId, date, target_amount_cents: cents },
        { onConflict: "location_id,date" }
      )
      .then(
        ({ error }) => {
          if (error) setError(error.message);
          setRevenueSaving(false);
        },
        () => setRevenueSaving(false)
      );
  }, [locationId, date, expectedRevenue]);

  useEffect(() => {
    if (!expectedRevenue.trim()) return;
    const t = setTimeout(saveRevenue, 800);
    return () => clearTimeout(t);
  }, [expectedRevenue, saveRevenue]);

  const saveCount = useCallback(
    (prepItemId: string, quantity: number) => {
      if (!locationId || !date) return;
      setCountSaving((s) => ({ ...s, [prepItemId]: true }));
      const supabase = createClient();
      void supabase
        .from("daily_prep_counts")
        .upsert(
          {
            location_id: locationId,
            date,
            prep_item_id: prepItemId,
            quantity,
          },
          { onConflict: "location_id,date,prep_item_id" }
        )
        .then(
          ({ error }) => {
            if (error) setError(error.message);
            setCountSaving((s) => ({ ...s, [prepItemId]: false }));
          },
          () => setCountSaving((s) => ({ ...s, [prepItemId]: false }))
        );
    },
    [locationId, date]
  );

  const clearPrepCount = useCallback(
    (prepItemId: string) => {
      if (!locationId || !date) return;
      setCounts((c) => {
        const next = { ...c };
        delete next[prepItemId];
        return next;
      });
      setCountSaving((s) => ({ ...s, [prepItemId]: true }));
      const supabase = createClient();
      void supabase
        .from("daily_prep_counts")
        .delete()
        .eq("location_id", locationId)
        .eq("date", date)
        .eq("prep_item_id", prepItemId)
        .then(
          ({ error }) => {
            if (error) setError(error.message);
            setCountSaving((s) => ({ ...s, [prepItemId]: false }));
          },
          () => setCountSaving((s) => ({ ...s, [prepItemId]: false }))
        );
    },
    [locationId, date]
  );

  const commitPrepCount = useCallback(
    (prepItemId: string, n: number) => {
      setCounts((c) => ({ ...c, [prepItemId]: n }));
      saveCount(prepItemId, n);
    },
    [saveCount]
  );

  const saveRawCount = useCallback(
    (rawIngredientId: string, quantity: number) => {
      if (!locationId || !date) return;
      setRawCountSaving((s) => ({ ...s, [rawIngredientId]: true }));
      const supabase = createClient();
      void supabase
        .from("daily_stock_counts")
        .upsert(
          {
            location_id: locationId,
            date,
            raw_ingredient_id: rawIngredientId,
            quantity,
          },
          { onConflict: "location_id,date,raw_ingredient_id" }
        )
        .then(
          ({ error }) => {
            if (error) setError(error.message);
            setRawCountSaving((s) => ({ ...s, [rawIngredientId]: false }));
          },
          () => setRawCountSaving((s) => ({ ...s, [rawIngredientId]: false }))
        );
    },
    [locationId, date]
  );

  const clearRawCount = useCallback(
    (rawIngredientId: string) => {
      if (!locationId || !date) return;
      setRawCounts((c) => {
        const next = { ...c };
        delete next[rawIngredientId];
        return next;
      });
      setRawCountSaving((s) => ({ ...s, [rawIngredientId]: true }));
      const supabase = createClient();
      void supabase
        .from("daily_stock_counts")
        .delete()
        .eq("location_id", locationId)
        .eq("date", date)
        .eq("raw_ingredient_id", rawIngredientId)
        .then(
          ({ error }) => {
            if (error) setError(error.message);
            setRawCountSaving((s) => ({ ...s, [rawIngredientId]: false }));
          },
          () => setRawCountSaving((s) => ({ ...s, [rawIngredientId]: false }))
        );
    },
    [locationId, date]
  );

  const handleRawCountChange = useCallback(
    (rawIngredientId: string, value: string) => {
      const raw = value.trim().replace(",", ".");
      if (raw === "" || raw === ".") {
        clearRawCount(rawIngredientId);
        return;
      }
      const num = parseFloat(raw);
      const final = !Number.isFinite(num) || num < 0 ? 0 : num;
      setRawCounts((c) => ({ ...c, [rawIngredientId]: final }));
      saveRawCount(rawIngredientId, final);
    },
    [saveRawCount, clearRawCount]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 350, tolerance: 10 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const flushPrepOrderPersist = useCallback((updates: { id: string; display_order: number }[]) => {
    if (updates.length === 0) return;
    if (prepOrderPersistTimer.current) {
      clearTimeout(prepOrderPersistTimer.current);
      prepOrderPersistTimer.current = null;
    }
    setPrepOrderSaving(true);
    const supabase = createClient();
    void Promise.all(
      updates.map((u) =>
        supabase.from("location_prep_items").update({ display_order: u.display_order }).eq("id", u.id)
      )
    ).then((results) => {
      const err = results.find((r) => r.error)?.error;
      if (err) setError(err.message);
      setPrepOrderSaving(false);
    });
  }, []);

  const schedulePrepOrderPersist = useCallback(
    (updates: { id: string; display_order: number }[]) => {
      if (prepOrderPersistTimer.current) clearTimeout(prepOrderPersistTimer.current);
      prepOrderPersistTimer.current = setTimeout(() => {
        prepOrderPersistTimer.current = null;
        flushPrepOrderPersist(updates);
      }, 400);
    },
    [flushPrepOrderPersist]
  );

  const handlePrepDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setLocationPrepItems((items) => {
        const oldIndex = items.findIndex((r) => r.id === active.id);
        const newIndex = items.findIndex((r) => r.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return items;
        const next = arrayMove(items, oldIndex, newIndex);
        const withOrder = next.map((r, i) => ({ ...r, display_order: i * 10 }));
        const updates = withOrder.map((r) => ({ id: r.id, display_order: r.display_order ?? 0 }));
        queueMicrotask(() => schedulePrepOrderPersist(updates));
        return withOrder;
      });
    },
    [schedulePrepOrderPersist]
  );

  const flushRawOrderPersist = useCallback((updates: { id: string; stocktake_display_order: number }[]) => {
    if (updates.length === 0) return;
    if (rawOrderPersistTimer.current) {
      clearTimeout(rawOrderPersistTimer.current);
      rawOrderPersistTimer.current = null;
    }
    setRawOrderSaving(true);
    const supabase = createClient();
    void Promise.all(
      updates.map((u) =>
        supabase.from("raw_ingredients").update({ stocktake_display_order: u.stocktake_display_order }).eq("id", u.id)
      )
    ).then((results) => {
      const err = results.find((r) => r.error)?.error;
      if (err) setError(err.message);
      setRawOrderSaving(false);
    });
  }, []);

  const scheduleRawOrderPersist = useCallback(
    (updates: { id: string; stocktake_display_order: number }[]) => {
      if (rawOrderPersistTimer.current) clearTimeout(rawOrderPersistTimer.current);
      rawOrderPersistTimer.current = setTimeout(() => {
        rawOrderPersistTimer.current = null;
        flushRawOrderPersist(updates);
      }, 400);
    },
    [flushRawOrderPersist]
  );

  const handleRawDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const tab = rawSubtab;
      setAllVisibleRaws((prev) => {
        const tabList = prev.filter((r) =>
          tab === "weekly" ? isWeeklyStocktakeItem(r) : !isWeeklyStocktakeItem(r)
        );
        const sorted = sortRawStocktakeList(tabList);
        const tabIds = sorted.map((r) => r.id);
        const oldIndex = tabIds.indexOf(String(active.id));
        const newIndex = tabIds.indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0) return prev;
        const orderedTabIds = arrayMove(tabIds, oldIndex, newIndex);
        const { next, updates } = reorderRawListByIds(prev, tab, orderedTabIds);
        queueMicrotask(() => scheduleRawOrderPersist(updates));
        return next;
      });
    },
    [rawSubtab, scheduleRawOrderPersist]
  );

  useEffect(() => {
    return () => {
      if (rawOrderPersistTimer.current) clearTimeout(rawOrderPersistTimer.current);
      if (prepOrderPersistTimer.current) clearTimeout(prepOrderPersistTimer.current);
    };
  }, []);

  const packSizesByIngredient = packSizes.reduce<Record<string, IngredientPackSize[]>>((acc, p) => {
    if (!acc[p.raw_ingredient_id]) acc[p.raw_ingredient_id] = [];
    acc[p.raw_ingredient_id].push(p);
    return acc;
  }, {});

  // Finished products: optional sub-groups by category; otherwise one block
  const itemsByCategory = locationPrepItems.reduce<Record<string, LocationPrepItem[]>>(
    (acc, row) => {
      const cat = row.prep_items?.category?.trim() || "All finished products";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(row);
      return acc;
    },
    {}
  );
  const categoryOrder = Object.keys(itemsByCategory).sort((a, b) => {
    if (a === "All finished products" && b !== "All finished products") return -1;
    if (b === "All finished products" && a !== "All finished products") return 1;
    return a.localeCompare(b);
  });
  const totalItems = locationPrepItems.length;
  const countedItems = locationPrepItems.filter(
    (row) => counts[row.prep_item_id] !== undefined
  ).length;
  const progressPercent = totalItems ? Math.round((countedItems / totalItems) * 100) : 0;

  const schedulesBySupplierJs = useMemo(() => {
    if (!stocktakeDeliveryMeta?.schedules.length) return {};
    const m: Record<string, number[]> = {};
    for (const s of stocktakeDeliveryMeta.schedules) {
      if (!m[s.supplier_id]) m[s.supplier_id] = [];
      m[s.supplier_id].push(supplierScheduleDayToJsDay(s.day_of_week));
    }
    return m;
  }, [stocktakeDeliveryMeta]);

  const preferredSupplierByRawId = useMemo(() => {
    if (!stocktakeDeliveryMeta || stocktakeDeliveryMeta.skipFilter) return {};
    const locationSupplierIds = new Set(stocktakeDeliveryMeta.supplierIds);
    const byRaw: Record<string, { supplier_id: string; is_preferred: boolean }[]> = {};
    for (const r of stocktakeDeliveryMeta.supplierIngredients) {
      if (!locationSupplierIds.has(r.supplier_id)) continue;
      if (!byRaw[r.raw_ingredient_id]) byRaw[r.raw_ingredient_id] = [];
      byRaw[r.raw_ingredient_id].push(r);
    }
    const rawIdList = allVisibleRaws.map((r) => r.id);
    const out: Record<string, string | null> = {};
    for (const rid of rawIdList) {
      const list = byRaw[rid];
      if (!list?.length) {
        out[rid] = null;
        continue;
      }
      const pref = list.find((x) => x.is_preferred);
      out[rid] = pref?.supplier_id ?? list[0].supplier_id;
    }
    return out;
  }, [stocktakeDeliveryMeta, allVisibleRaws]);

  const dailyRaws = useMemo(() => {
    const f = allVisibleRaws.filter((ing) => {
      if (isWeeklyStocktakeItem(ing)) return false;
      if (!stocktakeDeliveryMeta || stocktakeDeliveryMeta.skipFilter) return true;
      return isRawDeliverableTomorrow({
        stocktakeDate: date,
        rawId: ing.id,
        preferredSupplierByRawId,
        schedulesBySupplierJs,
      });
    });
    return sortRawStocktakeList(f);
  }, [
    allVisibleRaws,
    stocktakeDeliveryMeta,
    date,
    preferredSupplierByRawId,
    schedulesBySupplierJs,
  ]);
  const weeklyRaws = useMemo(() => {
    const f = allVisibleRaws.filter((ing) => isWeeklyStocktakeItem(ing));
    return sortRawStocktakeList(f);
  }, [allVisibleRaws]);
  const rawIngredientsForTab = rawSubtab === "daily" ? dailyRaws : weeklyRaws;
  const totalRaw = rawIngredientsForTab.length;
  const countedRaw = rawIngredientsForTab.filter((r) => rawCounts[r.id] !== undefined).length;
  const progressRawPercent = totalRaw ? Math.round((countedRaw / totalRaw) * 100) : 0;

  const displayedItemsByCategory = useMemo(() => {
    if (!showOnlyMissing) return itemsByCategory;
    const out: Record<string, LocationPrepItem[]> = {};
    for (const [cat, rows] of Object.entries(itemsByCategory)) {
      const f = rows.filter((row) => counts[row.prep_item_id] === undefined);
      if (f.length) out[cat] = f;
    }
    return out;
  }, [itemsByCategory, showOnlyMissing, counts]);

  const categoryOrderDisplayed = useMemo(
    () =>
      Object.keys(displayedItemsByCategory).sort((a, b) => {
        if (a === "All finished products" && b !== "All finished products") return -1;
        if (b === "All finished products" && a !== "All finished products") return 1;
        return a.localeCompare(b);
      }),
    [displayedItemsByCategory]
  );

  const rawTabList = useMemo(() => {
    if (!showOnlyMissing) return rawIngredientsForTab;
    return rawIngredientsForTab.filter((r) => rawCounts[r.id] === undefined);
  }, [rawIngredientsForTab, showOnlyMissing, rawCounts]);

  const missingPrepCount = useMemo(
    () => locationPrepItems.filter((row) => counts[row.prep_item_id] === undefined).length,
    [locationPrepItems, counts]
  );
  const missingRawCountForTab = useMemo(
    () => rawIngredientsForTab.filter((r) => rawCounts[r.id] === undefined).length,
    [rawIngredientsForTab, rawCounts]
  );

  const stocktakeFullyComplete = useMemo(() => {
    if (!locationId || loading) return true;
    const prepOk =
      totalItems === 0 || locationPrepItems.every((row) => counts[row.prep_item_id] !== undefined);
    const rawOk =
      allVisibleRaws.length === 0 || allVisibleRaws.every((r) => rawCounts[r.id] !== undefined);
    return prepOk && rawOk;
  }, [locationId, loading, totalItems, locationPrepItems, counts, allVisibleRaws, rawCounts]);

  return (
    <div className="min-h-screen bg-zinc-50 pb-24 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-2xl">
            Stocktake
          </h1>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 touch-manipulation"
          >
            Dashboard
          </Link>
        </div>

        <DailyWorkflowStepper
          warnStocktakeIncompleteNext={!loading && !!locationId && !stocktakeFullyComplete}
          stocktakeIncompleteMessage={STOCKTAKE_LEAVE_INCOMPLETE_MSG}
        />

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Date */}
        <section className="mb-5">
          <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Date
          </span>
          <p className="flex h-14 min-h-[56px] items-center rounded-xl border border-zinc-200 bg-white px-4 text-base dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
            {date || localCalendarDateString()}
          </p>
        </section>

        {/* 3. Expected revenue */}
        <section className="mb-6">
          <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Expected revenue (€)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0"
            value={expectedRevenue}
            onChange={(e) => setExpectedRevenue(e.target.value)}
            className="h-14 w-full min-h-[56px] rounded-xl border border-zinc-300 bg-white px-4 text-base touch-manipulation dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            aria-label="Expected revenue"
          />
          {revenueSaving && (
            <p className="mt-1.5 text-xs text-zinc-500">Saving…</p>
          )}
        </section>

        {!loading && locationId && (totalItems > 0 || allVisibleRaws.length > 0) && (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowOnlyMissing((v) => !v)}
              className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium touch-manipulation ${
                showOnlyMissing
                  ? "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100"
                  : "border border-zinc-300 bg-white text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
              aria-pressed={showOnlyMissing}
            >
              {showOnlyMissing ? "Toon alles" : "Alleen nog niet ingevuld"}
            </button>
            {showOnlyMissing && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Finished: {missingPrepCount} open · {rawSubtab === "daily" ? "Daily" : "Weekly"} raw:{" "}
                {missingRawCountForTab} open
              </span>
            )}
          </div>
        )}

        {/* Group 1: Finished / ready products */}
        {totalItems > 0 && (
          <section className="mb-6">
            <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              1. Finished products
            </h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Already prepared items (e.g. marinated chicken thigh, hummus, sauces). Enter how much you have <strong>ready</strong> (same unit as in your recipe book, usually grams).
            </p>
            <div className="mb-2 flex justify-between text-sm font-medium text-zinc-600 dark:text-zinc-400">
              <span>Finished products progress</span>
              <span>{countedItems} / {totalItems}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {totalItems > 1 && (
              <div className="mt-4 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={showOnlyMissing}
                    title={showOnlyMissing ? "Zet filter op “Toon alles” om te herschikken" : undefined}
                    onClick={() => setPrepReorderMode((v) => !v)}
                    className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium touch-manipulation ${
                      prepReorderMode
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "border border-zinc-300 bg-white text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                    aria-pressed={prepReorderMode}
                  >
                    {prepReorderMode ? "Done reordering" : "Reorder list (drag)"}
                  </button>
                  {prepOrderSaving && <span className="text-xs text-zinc-500">Saving order…</span>}
                </div>
                {prepReorderMode && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    <strong>Hold</strong> the grip on the left, then drag up or down. Order saves when you drop. Categories
                    are shown as hints; the list is one sequence for this location.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Finished products list (optional per category) */}
        {loading ? (
          <p className="py-8 text-zinc-500">Loading items…</p>
        ) : !locationId ? (
          <p className="py-8 text-zinc-500">Select a location to see prep items.</p>
        ) : locationPrepItems.length === 0 ? (
          <div className="py-8">
            <p className="mb-2 text-zinc-700 dark:text-zinc-300">
              No prep items linked to this location yet.
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Only products linked to this location appear here. Go to{" "}
              <Link href="/admin" className="font-medium text-zinc-900 underline dark:text-zinc-100">Admin</Link> → <strong>Locations</strong> → <strong>Manage products</strong>, or re-run the bulk import (migration 014) to link all recipes to this location.
            </p>
          </div>
        ) : prepReorderMode && totalItems > 1 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePrepDragEnd}>
            <SortableContext items={locationPrepItems.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-4">
                {locationPrepItems.map((row) => {
                  const item = row.prep_items;
                  if (!item) return null;
                  const isSaving = countSaving[item.id];
                  const cat = item.category?.trim() || "All finished products";
                  return (
                    <SortableStocktakeItem
                      key={row.id}
                      id={row.id}
                      dragLabel={item.name}
                      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{cat}</p>
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">{item.name}</p>
                          {item.unit && (
                            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                              {item.unit}
                              {item.content_amount != null &&
                                item.content_unit &&
                                ` · ${item.content_amount} ${item.content_unit} each`}
                            </p>
                          )}
                        </div>
                        <PrepCountField
                          prepItemId={item.id}
                          quantity={counts[item.id]}
                          onCommit={commitPrepCount}
                          onClear={clearPrepCount}
                          isSaving={!!isSaving}
                          label={item.name}
                        />
                      </div>
                    </SortableStocktakeItem>
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="space-y-8">
            {categoryOrderDisplayed.length === 0 && showOnlyMissing && totalItems > 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400">
                Alle finished products voor deze locatie zijn ingevuld.
              </p>
            ) : (
              categoryOrderDisplayed.map((category) => (
              <section key={category}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {category}
                </h3>
                <ul className="space-y-4">
                  {displayedItemsByCategory[category]!.map((row) => {
                    const item = row.prep_items;
                    if (!item) return null;
                    const isSaving = countSaving[item.id];
                    return (
                      <li
                        key={row.id}
                        className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-zinc-900 dark:text-zinc-100">
                              {item.name}
                            </p>
                            {item.unit && (
                              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                                {item.unit}
                                {item.content_amount != null &&
                                  item.content_unit &&
                                  ` · ${item.content_amount} ${item.content_unit} each`}
                              </p>
                            )}
                          </div>
                          <PrepCountField
                            prepItemId={item.id}
                            quantity={counts[item.id]}
                            onCommit={commitPrepCount}
                            onClear={clearPrepCount}
                            isSaving={!!isSaving}
                            label={item.name}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
            )}
          </div>
        )}

        {/* Group 2: Raw ingredients */}
        {allVisibleRaws.length > 0 && (
          <>
            <section className="mt-12 border-t border-zinc-200 pt-10 dark:border-zinc-700">
              <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                2. Raw ingredients
              </h2>
              {stocktakeDeliveryMeta?.skipFilter && (
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  Could not load supplier schedules; showing all daily ingredients. Check your connection and try
                  refreshing.
                </p>
              )}
            </section>
            <div className="mb-4 flex gap-2 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => setRawSubtab("daily")}
                className={`min-h-[48px] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors touch-manipulation ${
                  rawSubtab === "daily"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
                aria-pressed={rawSubtab === "daily"}
              >
                Daily ({dailyRaws.length})
              </button>
              <button
                type="button"
                onClick={() => setRawSubtab("weekly")}
                className={`min-h-[48px] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors touch-manipulation ${
                  rawSubtab === "weekly"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
                aria-pressed={rawSubtab === "weekly"}
              >
                Weekly ({weeklyRaws.length})
              </button>
            </div>
            {totalRaw > 0 && (
              <section className="mb-4">
                <div className="mb-2 flex justify-between text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  <span>{rawSubtab === "daily" ? "Daily" : "Weekly"} raw progress</span>
                  <span>{countedRaw} / {totalRaw}</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${progressRawPercent}%` }}
                  />
                </div>
              </section>
            )}
            {totalRaw > 1 && (
              <div className="mb-4 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={showOnlyMissing}
                    title={showOnlyMissing ? "Zet filter op “Toon alles” om te herschikken" : undefined}
                    onClick={() => setRawReorderMode((v) => !v)}
                    className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium touch-manipulation ${
                      rawReorderMode
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "border border-zinc-300 bg-white text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                    aria-pressed={rawReorderMode}
                  >
                    {rawReorderMode ? "Done reordering" : "Reorder list (drag)"}
                  </button>
                  {rawOrderSaving && (
                    <span className="text-xs text-zinc-500">Saving order…</span>
                  )}
                </div>
                {rawReorderMode && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    <strong>Hold</strong> the grip on the left, then drag up or down. Daily and Weekly lists reorder
                    separately. Order saves when you drop.
                  </p>
                )}
              </div>
            )}
            <section className="mt-2">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {rawSubtab === "daily" ? "Daily stock count" : "Weekly stock count"}
              </h3>
              {rawIngredientsForTab.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400">
                  {rawSubtab === "daily"
                    ? "No ingredients match “delivery tomorrow” for today, or none are linked to a supplier with a schedule. Check Admin → Suppliers (delivery days) and ingredient–supplier links. Use the Weekly tab for other counts."
                    : "No weekly items yet. Set master column J to 1 (or set a stocktake weekday in Admin) for products you only count weekly."}
                </p>
              ) : rawTabList.length === 0 && showOnlyMissing ? (
                <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400">
                  Alles in dit tabblad is ingevuld.
                </p>
              ) : rawReorderMode && totalRaw > 1 ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRawDragEnd}>
                  <SortableContext
                    items={rawIngredientsForTab.map((r) => r.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="space-y-4">
                      {rawIngredientsForTab.map((ing) => (
                        <StocktakeRawRow
                          key={ing.id}
                          ing={ing}
                          sortable
                          packs={packSizesByIngredient[ing.id] ?? []}
                          rawCounts={rawCounts}
                          rawCountSaving={rawCountSaving}
                          setRawCounts={setRawCounts}
                          saveRawCount={saveRawCount}
                          clearRawCount={clearRawCount}
                          handleRawCountChange={handleRawCountChange}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              ) : (
                <ul className="space-y-4">
                  {rawTabList.map((ing) => (
                    <StocktakeRawRow
                      key={ing.id}
                      ing={ing}
                      sortable={false}
                      packs={packSizesByIngredient[ing.id] ?? []}
                      rawCounts={rawCounts}
                      rawCountSaving={rawCountSaving}
                      setRawCounts={setRawCounts}
                      saveRawCount={saveRawCount}
                      clearRawCount={clearRawCount}
                      handleRawCountChange={handleRawCountChange}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {!loading && locationId && allVisibleRaws.length === 0 && locationPrepItems.length > 0 && (
          <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
            Add raw ingredients under Admin → Ingredients to count them here and get order suggestions on the Ordering page.
          </p>
        )}

        <nav className="mt-8 flex gap-4">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Dashboard
          </Link>
          <Link
            href="/prep-list"
            onClick={(e) => {
              if (stocktakeFullyComplete) return;
              e.preventDefault();
              if (typeof window !== "undefined" && window.confirm(STOCKTAKE_LEAVE_INCOMPLETE_MSG)) {
                router.push("/prep-list");
              }
            }}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Prep List →
          </Link>
        </nav>
      </main>
    </div>
  );
}
