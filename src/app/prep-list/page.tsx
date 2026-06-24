"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ChickpeaSoakCallout } from "@/components/ChickpeaSoakCallout";
import { DailyWorkflowStepper } from "@/components/DailyWorkflowStepper";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import { localCalendarDateString } from "@/lib/date";
import { ensureEffectiveDailyRevenueTargetCents } from "@/lib/revenueTarget";
import type { Location, PrepItem } from "@/lib/types";
import {
  getRevenueMultiplier,
  calcNeededQuantity,
  calcToMake,
  type PrepPriority,
} from "@/lib/calculations";
import { formatDecimal2, formatEuroFromCents, formatPrepQuantity } from "@/lib/format";
import { soakDryChickpeasKgFromPrepState } from "@/lib/chickpeaSoakPrepNeed";
import { resolvePrepListPriority } from "@/lib/prepListPriority";
import {
  calcRegularPitaZaatarToMake,
  extractPitaStockCounts,
  isRegularPitaPrepName,
  isWholewheatPitaPrepName,
} from "@/lib/pitaPrepStock";
import type { RawIngredient } from "@/lib/types";

type LocationPrepItemRow = {
  id: string;
  location_id: string;
  prep_item_id: string;
  base_quantity?: number | null;
  display_order?: number | null;
  prep_items: PrepItem | null;
};

const PREP_DONE_KEY = "prep-list-done";

function getStoredDone(locationId: string, date: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`${PREP_DONE_KEY}-${locationId}-${date}`);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function setStoredDone(locationId: string, date: string, done: Record<string, boolean>) {
  try {
    localStorage.setItem(`${PREP_DONE_KEY}-${locationId}-${date}`, JSON.stringify(done));
  } catch {}
}

export default function PrepListPage() {
  const { locationId, locationOptions } = useLocation();
  const [date, setDate] = useState(() => localCalendarDateString());
  const [locationPrepItems, setLocationPrepItems] = useState<LocationPrepItemRow[]>([]);
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({});
  const [rawStockCounts, setRawStockCounts] = useState<Record<string, number>>({});
  const [rawIngredients, setRawIngredients] = useState<RawIngredient[]>([]);
  const [revenueTargetCents, setRevenueTargetCents] = useState<number | null>(null);
  const [locationDetails, setLocationDetails] = useState<Location | null>(null);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) {
      setLocationPrepItems([]);
      setTodayCounts({});
      setRawStockCounts({});
      setRawIngredients([]);
      setRevenueTargetCents(null);
      setLocationDetails(null);
      setLoading(false);
      setCompleted({});
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const d = date || localCalendarDateString();

    void (async () => {
      const revCents = await ensureEffectiveDailyRevenueTargetCents(supabase, locationId, d);
      const [lpiRes, countRes, rawStockRes, rawRes, locRes] = await Promise.all([
        supabase
          .from("location_prep_items")
          .select("id, location_id, prep_item_id, base_quantity, display_order, prep_items(*)")
          .eq("location_id", locationId)
          .order("display_order")
          .order("prep_item_id"),
        supabase
          .from("daily_prep_counts")
          .select("prep_item_id, quantity")
          .eq("location_id", locationId)
          .eq("date", d),
        supabase
          .from("daily_stock_counts")
          .select("raw_ingredient_id, quantity")
          .eq("location_id", locationId)
          .eq("date", d),
        supabase.from("raw_ingredients").select("id, name").eq("location_id", locationId),
        supabase
          .from("locations")
          .select("full_capacity_revenue")
          .eq("id", locationId)
          .single(),
      ]);
      try {
        if (lpiRes.error) throw new Error(lpiRes.error.message);
        if (countRes.error) throw new Error(countRes.error.message);

        const raw = (lpiRes.data as (Omit<LocationPrepItemRow, "prep_items"> & { prep_items: PrepItem | PrepItem[] | null })[]) ?? [];
        const items: LocationPrepItemRow[] = raw.map((row) => ({
          ...row,
          prep_items: Array.isArray(row.prep_items) ? row.prep_items[0] ?? null : row.prep_items,
        }));

        const counts = (countRes.data as { prep_item_id: string; quantity: number }[]) ?? [];
        const rawStockList =
          (rawStockRes.data as { raw_ingredient_id: string; quantity: number }[]) ?? [];
        const rawList = (rawRes.data as RawIngredient[]) ?? [];
        const loc = locRes.data as Location | null;

        setLocationPrepItems(items);
        setTodayCounts(Object.fromEntries(counts.map((c) => [c.prep_item_id, Number(c.quantity)])));
        setRawStockCounts(
          Object.fromEntries(rawStockList.map((c) => [c.raw_ingredient_id, Number(c.quantity)]))
        );
        setRawIngredients(rawList);
        setRevenueTargetCents(revCents);
        setLocationDetails(loc ?? null);
        setCompleted(getStoredDone(locationId, d));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
        setLocationPrepItems([]);
        setTodayCounts({});
        setRawStockCounts({});
        setRawIngredients([]);
        setRevenueTargetCents(null);
        setLocationDetails(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [locationId, date]);

  const revenueMultiplier = useMemo(() => {
    return getRevenueMultiplier({
      todayRevenueCents: revenueTargetCents,
      fullCapacityRevenue: locationDetails?.full_capacity_revenue ?? null,
    });
  }, [revenueTargetCents, locationDetails]);

  type PrepRow = {
    row: LocationPrepItemRow;
    needed: number;
    toMake: number;
    priority: PrepPriority;
    currentStock: number;
  };

  const { todayRows, tomorrowRows } = useMemo(() => {
    const prepItemsById = Object.fromEntries(
      locationPrepItems.map((row) => [row.prep_item_id, row.prep_items])
    );
    const neededByPrepId: Record<string, number> = {};
    for (const row of locationPrepItems) {
      neededByPrepId[row.prep_item_id] = calcNeededQuantity({
        baseQuantity: row.base_quantity ?? 1,
        revenueMultiplier,
      });
    }
    const pitaStock = extractPitaStockCounts({
      prepItemsById,
      prepStockByPrepItemId: todayCounts,
      rawIngredients,
      rawStockByRawId: rawStockCounts,
    });
    let neededRegularBoxes = 0;
    let neededWholewheatBoxes = 0;
    for (const row of locationPrepItems) {
      const name = row.prep_items?.name;
      const needed = neededByPrepId[row.prep_item_id] ?? 0;
      if (isRegularPitaPrepName(name)) neededRegularBoxes = needed;
      if (isWholewheatPitaPrepName(name)) neededWholewheatBoxes = needed;
    }
    const pitaZaatarToMake = calcRegularPitaZaatarToMake({
      neededRegularBoxes,
      neededWholewheatBoxes,
      ...pitaStock,
    });

    const list: PrepRow[] = [];
    for (const row of locationPrepItems) {
      const item = row.prep_items;
      if (!item) continue;
      const baseQty = row.base_quantity ?? 1;
      const needed = calcNeededQuantity({ baseQuantity: baseQty, revenueMultiplier });
      const currentStock = todayCounts[row.prep_item_id] ?? 0;
      let toMake = calcToMake({
        needed,
        currentStock,
        batchSize: item.batch_size ?? null,
      });
      if (isRegularPitaPrepName(item.name) && pitaZaatarToMake > 0) {
        toMake = Math.max(toMake, pitaZaatarToMake);
      }
      const priority = resolvePrepListPriority({
        prepName: item.name,
        currentStock,
        needed,
        toMake,
        prepTimeHours: item.prep_time_hours ?? null,
      });
      if (priority === "hidden") continue;
      list.push({ row, needed, toMake, priority, currentStock });
    }
    list.sort((a, b) => {
      const order: PrepPriority[] = [1, 2, 3, "hidden"];
      const pi = order.indexOf(a.priority) - order.indexOf(b.priority);
      if (pi !== 0) return pi;
      const oa = a.row.display_order ?? 0;
      const ob = b.row.display_order ?? 0;
      if (oa !== ob) return oa - ob;
      return (a.row.prep_items?.name || "").localeCompare(b.row.prep_items?.name || "", undefined, {
        sensitivity: "base",
      });
    });
    const todayRows = list.filter((r) => !r.row.prep_items?.requires_overnight);
    const tomorrowRows = list.filter((r) => r.row.prep_items?.requires_overnight);
    return { todayRows, tomorrowRows };
  }, [locationPrepItems, todayCounts, rawStockCounts, rawIngredients, revenueMultiplier]);

  const soakDryChickpeasKg = useMemo(() => {
    return soakDryChickpeasKgFromPrepState({
      locationPrepItems: locationPrepItems.map((row) => ({
        prep_item_id: row.prep_item_id,
        base_quantity: row.base_quantity,
        display_order: row.display_order,
        prep_items: row.prep_items,
      })),
      todayCounts,
      revenueMultiplier,
    });
  }, [locationPrepItems, todayCounts, revenueMultiplier]);

  const toggleDone = (prepItemId: string) => {
    setCompleted((prev) => {
      const next = { ...prev, [prepItemId]: !prev[prepItemId] };
      if (locationId && date) setStoredDone(locationId, date, next);
      return next;
    });
  };

  const handlePrint = () => window.print();

  const locationName = locationOptions.find((l) => l.id === locationId)?.name ?? "";

  return (
    <div className="min-h-screen bg-background font-sans">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="section-title text-xl sm:text-2xl">
            Prep List
          </h1>
          <Link href="/dashboard" className="text-sm font-medium text-ink-soft/80">
            Dashboard
          </Link>
        </div>

        <DailyWorkflowStepper />

        {error && (
          <div className="alert-error mb-4 rounded-xl p-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4 no-print">
          {locationName && (
            <p className="help-text">
              Location: <strong>{locationName}</strong>
            </p>
          )}
          <p className="text-xs leading-relaxed text-ink-soft/80">
            Stock / Make here is based on <strong>section 1</strong> (finished prep products,{" "}
            <code className="text-[11px]">daily_prep_counts</code>). Raw ingredients (section 2, e.g. chicken from
            delivery) are handled separately in Ordering — enter both on stocktake if you want both in the numbers.
          </p>
          <div>
            <span className="mb-1 block label">
              Date
            </span>
            <p className="flex h-12 items-center card px-4">
              {date || localCalendarDateString()}
            </p>
          </div>
          {revenueTargetCents != null && (
            <p className="help-text">
              Revenue target: €{formatEuroFromCents(revenueTargetCents)} · vs full capacity:{" "}
              {formatDecimal2(revenueMultiplier)}×
            </p>
          )}
        </div>

        {loading ? (
          <p className="py-8 text-ink-soft/80">Loading…</p>
        ) : !locationId ? (
          <p className="py-8 text-ink-soft/80">Select a location.</p>
        ) : todayRows.length === 0 && tomorrowRows.length === 0 ? (
          <p className="py-8 text-ink-soft/80">No prep items to show, or all items are fully stocked.</p>
        ) : (
          <>
            <ChickpeaSoakCallout kg={soakDryChickpeasKg} />
            <div className="mt-6 flex gap-2 no-print">
              <button
                type="button"
                onClick={handlePrint}
                className="btn-primary rounded-xl px-4 py-2.5 text-sm font-medium"
              >
                Print
              </button>
            </div>

            <div className="mt-6 space-y-6">
              {todayRows.map(({ row, needed, toMake, priority, currentStock }) => {
                const item = row.prep_items!;
                const priorityClass =
                  priority === 1
                    ? "border-l-4 border-accent-terracotta bg-brand-sand/40"
                    : priority === 2
                      ? "border-l-4 border-accent-orange bg-brand-sand/50"
                      : "border-l-4 border-brand-green bg-brand-sage/25";

                return (
                  <div
                    key={row.id}
                    className={`rounded-xl border border-brand-green/10 p-4 ${priorityClass}`}
                  >
                    {item.requires_overnight && (
                      <div className="alert-warning mb-2 rounded-lg px-3 py-2 text-sm font-medium">
                        Overnight: {item.overnight_alert || "Prepare the day before."}
                      </div>
                    )}
                    {item.special_alert && (
                      <div className="mb-2 rounded-lg bg-brand-sage/30 px-3 py-2 text-sm text-brand-green">
                        {item.special_alert}
                      </div>
                    )}
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={!!completed[item.id]}
                        onChange={() => toggleDone(item.id)}
                        className="mt-1 h-5 w-5 shrink-0 rounded border-brand-green/15"
                        aria-label={`Done: ${item.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{item.name}</p>
                        {item.unit && (
                          <p className="help-text">{item.unit}</p>
                        )}
                        <p className="mt-1 help-text">
                          Stock: {formatPrepQuantity(currentStock)} · Needed:{" "}
                          {formatPrepQuantity(needed)} · Make:{" "}
                          <strong>{formatPrepQuantity(toMake)}</strong>
                          {item.batch_size != null && item.batch_size > 0 && (
                            <span> (batch {item.batch_size})</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {tomorrowRows.length > 0 && (
                <section className="border-t border-brand-green/10 pt-6">
                  <h2 className="mb-3 section-title">
                    Tomorrow (overnight)
                  </h2>
                  <div className="space-y-4">
                    {tomorrowRows.map(({ row, needed, toMake, priority, currentStock }) => {
                      const item = row.prep_items!;
                      const priorityClass =
                        priority === 1
                          ? "border-l-4 border-accent-terracotta bg-brand-sand/40"
                          : priority === 2
                            ? "border-l-4 border-accent-orange bg-brand-sand/50"
                            : "border-l-4 border-brand-green bg-brand-sage/25";

                      return (
                        <div
                          key={row.id}
                          className={`rounded-xl border border-brand-green/10 p-4 ${priorityClass}`}
                        >
                          <div className="alert-warning mb-2 rounded-lg px-3 py-2 text-sm font-medium">
                            Overnight: {item.overnight_alert || "Prepare the day before."}
                          </div>
                          {item.special_alert && (
                            <div className="mb-2 rounded-lg bg-brand-sage/30 px-3 py-2 text-sm text-brand-green">
                              {item.special_alert}
                            </div>
                          )}
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={!!completed[item.id]}
                              onChange={() => toggleDone(item.id)}
                              className="mt-1 h-5 w-5 shrink-0 rounded border-brand-green/15"
                              aria-label={`Done: ${item.name}`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-ink">{item.name}</p>
                              {item.unit && (
                                <p className="help-text">{item.unit}</p>
                              )}
                              <p className="mt-1 help-text">
                                Stock: {formatPrepQuantity(currentStock)} · Needed:{" "}
                                {formatPrepQuantity(needed)} · Make:{" "}
                                <strong>{formatPrepQuantity(toMake)}</strong>
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </>
        )}

        <div className="mt-8 flex gap-4 no-print">
          <Link href="/stocktake" className="text-sm font-medium text-ink-soft">
            ← Stocktake
          </Link>
          <Link href="/ordering" className="text-sm font-medium text-ink-soft">
            Ordering →
          </Link>
        </div>
      </main>
    </div>
  );
}
