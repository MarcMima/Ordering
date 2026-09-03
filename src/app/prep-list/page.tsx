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
import type { Location, PrepItem, PrepListAdjustment } from "@/lib/types";
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
  calcPitaRawBoxesToPrep,
  extractPitaStockCounts,
  isRegularPitaPrepName,
  isWholewheatPitaPrepName,
} from "@/lib/pitaPrepStock";
import type { RawIngredient } from "@/lib/types";
import {
  ADJUSTMENT_REASONS,
  computeBaseSuggestions,
  reasonLabel,
  type AdjustmentReason,
  type SuggestionDecision,
} from "@/lib/prepBaseSuggestions";

/** Days of adjustment history loaded for the learning suggestions. */
const SUGGESTION_WINDOW_DAYS = 28;

function isoDaysAgo(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function ReasonChips({
  value,
  onPick,
  disabled,
}: {
  value: string | null | undefined;
  onPick: (r: AdjustmentReason) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ADJUSTMENT_REASONS.map((r) => (
        <button
          key={r.value}
          type="button"
          disabled={disabled}
          onClick={() => onPick(r.value)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            value === r.value
              ? "border-brand-green bg-brand-green text-white"
              : "border-brand-green/25 bg-white/60 text-ink"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

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

function parseQty(raw: string): number | null {
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Number input that commits on blur / Enter; keeps typing local. */
function MakeInput({
  value,
  onCommit,
  label,
}: {
  value: number;
  onCommit: (n: number) => void;
  label: string;
}) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setText(String(value));
  }
  const commit = () => {
    const n = parseQty(text);
    if (n == null) {
      setText(String(value));
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="input h-10 w-24 text-center"
      aria-label={label}
    />
  );
}

export default function PrepListPage() {
  const { locationId, locationOptions } = useLocation();
  const [date] = useState(() => localCalendarDateString());
  const [locationPrepItems, setLocationPrepItems] = useState<LocationPrepItemRow[]>([]);
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({});
  const [rawStockCounts, setRawStockCounts] = useState<Record<string, number>>({});
  const [rawIngredients, setRawIngredients] = useState<RawIngredient[]>([]);
  const [revenueTargetCents, setRevenueTargetCents] = useState<number | null>(null);
  const [locationDetails, setLocationDetails] = useState<Location | null>(null);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [adjustments, setAdjustments] = useState<PrepListAdjustment[]>([]);
  const [history, setHistory] = useState<PrepListAdjustment[]>([]);
  const [decisions, setDecisions] = useState<SuggestionDecision[]>([]);
  const [pendingReasonId, setPendingReasonId] = useState<string | null>(null);
  const [addReason, setAddReason] = useState<AdjustmentReason | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addItemId, setAddItemId] = useState<string>("");
  const [addName, setAddName] = useState("");
  const [addUnit, setAddUnit] = useState("");
  const [addQty, setAddQty] = useState("1");
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
      setAdjustments([]);
      setHistory([]);
      setDecisions([]);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const d = date || localCalendarDateString();

    void (async () => {
      const revCents = await ensureEffectiveDailyRevenueTargetCents(supabase, locationId, d);
      const [lpiRes, countRes, rawStockRes, rawRes, locRes, adjRes, decRes] = await Promise.all([
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
        supabase
          .from("prep_list_adjustments")
          .select("*")
          .eq("location_id", locationId)
          .gte("date", isoDaysAgo(d, SUGGESTION_WINDOW_DAYS))
          .lte("date", d)
          .order("created_at"),
        supabase
          .from("prep_base_suggestion_decisions")
          .select("prep_item_id, created_at")
          .eq("location_id", locationId),
      ]);
      try {
        if (lpiRes.error) throw new Error(lpiRes.error.message);
        if (countRes.error) throw new Error(countRes.error.message);
        if (rawStockRes.error) throw new Error(rawStockRes.error.message);
        if (rawRes.error) throw new Error(rawRes.error.message);
        if (locRes.error) throw new Error(locRes.error.message);
        if (adjRes.error) throw new Error(adjRes.error.message);
        if (decRes.error) throw new Error(decRes.error.message);

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
        const allAdj = (adjRes.data as PrepListAdjustment[]) ?? [];
        setAdjustments(allAdj.filter((a) => a.date === d));
        setHistory(allAdj);
        setDecisions((decRes.data as SuggestionDecision[]) ?? []);
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
    /** Kitchen override of the calculated quantity (edit mode). */
    override: PrepListAdjustment | null;
    /** What the model said before any override. */
    modelToMake: number;
  };

  const mergeAdjustment = (saved: PrepListAdjustment) => {
    setAdjustments((prev) => [...prev.filter((a) => a.id !== saved.id), saved]);
    setHistory((prev) => [...prev.filter((a) => a.id !== saved.id), saved]);
  };
  const dropAdjustment = (id: string) => {
    setAdjustments((prev) => prev.filter((a) => a.id !== id));
    setHistory((prev) => prev.filter((a) => a.id !== id));
  };

  const adjustmentByPrepId = useMemo(() => {
    const map: Record<string, PrepListAdjustment> = {};
    for (const a of adjustments) if (a.prep_item_id) map[a.prep_item_id] = a;
    return map;
  }, [adjustments]);
  const customTasks = useMemo(
    () => adjustments.filter((a) => !a.prep_item_id && !a.removed),
    [adjustments]
  );
  const removedAdjustments = useMemo(() => adjustments.filter((a) => a.removed), [adjustments]);

  const { todayRows, tomorrowRows, hiddenRows } = useMemo(() => {
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
    const hidden: PrepRow[] = [];
    for (const row of locationPrepItems) {
      const item = row.prep_items;
      if (!item) continue;
      const baseQty = row.base_quantity ?? 1;
      let needed = calcNeededQuantity({ baseQuantity: baseQty, revenueMultiplier });
      const currentStock = todayCounts[row.prep_item_id] ?? 0;
      let toMake = calcToMake({
        needed,
        currentStock,
        batchSize: item.batch_size ?? null,
      });
      if (isRegularPitaPrepName(item.name)) {
        if (pitaZaatarToMake > 0) {
          toMake = Math.max(toMake, pitaZaatarToMake);
        }
        const rawToPrep = calcPitaRawBoxesToPrep({
          rawBoxes: pitaStock.regularRawBoxes,
          batchSize: item.batch_size,
        });
        if (rawToPrep > 0) toMake = Math.max(toMake, rawToPrep);
        needed = Math.max(needed, pitaStock.regularRawBoxes);
      }
      if (isWholewheatPitaPrepName(item.name)) {
        const rawToPrep = calcPitaRawBoxesToPrep({
          rawBoxes: pitaStock.wholewheatRawBoxes,
          batchSize: item.batch_size,
        });
        if (rawToPrep > 0) toMake = Math.max(toMake, rawToPrep);
        needed = Math.max(needed, pitaStock.wholewheatRawBoxes);
      }
      let priority = resolvePrepListPriority({
        prepName: item.name,
        currentStock,
        needed,
        toMake,
        prepTimeHours: item.prep_time_hours ?? null,
      });
      const adj = adjustmentByPrepId[row.prep_item_id] ?? null;
      const modelToMake = toMake;
      if (adj?.removed) {
        hidden.push({ row, needed, toMake, priority, currentStock, override: adj, modelToMake });
        continue;
      }
      if (adj && adj.make_override != null) {
        toMake = Number(adj.make_override);
        if (priority === "hidden") priority = 3;
      }
      if (priority === "hidden") {
        hidden.push({ row, needed, toMake, priority, currentStock, override: adj, modelToMake });
        continue;
      }
      list.push({ row, needed, toMake, priority, currentStock, override: adj, modelToMake });
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
    hidden.sort((a, b) =>
      (a.row.prep_items?.name || "").localeCompare(b.row.prep_items?.name || "", undefined, {
        sensitivity: "base",
      })
    );
    return { todayRows, tomorrowRows, hiddenRows: hidden };
  }, [locationPrepItems, todayCounts, rawStockCounts, rawIngredients, revenueMultiplier, adjustmentByPrepId]);

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

  const runSave = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  /** Insert or update the adjustment row for an existing prep item. */
  const upsertItemAdjustment = (
    prepItemId: string,
    patch: { make_override?: number | null; removed?: boolean; reason?: AdjustmentReason | null },
    snapshot?: { modelMake: number; modelNeeded: number; stock: number }
  ) =>
    runSave(async () => {
      if (!locationId) return;
      const supabase = createClient();
      const existing = adjustmentByPrepId[prepItemId];
      const payload = {
        location_id: locationId,
        date,
        prep_item_id: prepItemId,
        make_override: patch.make_override ?? existing?.make_override ?? null,
        removed: patch.removed ?? existing?.removed ?? false,
        reason: patch.reason ?? existing?.reason ?? null,
        model_make: snapshot?.modelMake ?? existing?.model_make ?? null,
        model_needed: snapshot?.modelNeeded ?? existing?.model_needed ?? null,
        stock_at_edit: snapshot?.stock ?? existing?.stock_at_edit ?? null,
        revenue_multiplier: existing?.revenue_multiplier ?? revenueMultiplier,
        updated_at: new Date().toISOString(),
      };
      const { data, error: err } = await supabase
        .from("prep_list_adjustments")
        .upsert(payload, { onConflict: "location_id,date,prep_item_id" })
        .select("*")
        .single();
      if (err) throw new Error(err.message);
      const saved = data as PrepListAdjustment;
      mergeAdjustment(saved);
      if (!saved.reason) setPendingReasonId(saved.id);
    });

  const setReason = (id: string, reason: AdjustmentReason) =>
    runSave(async () => {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("prep_list_adjustments")
        .update({ reason, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (err) throw new Error(err.message);
      mergeAdjustment(data as PrepListAdjustment);
      setPendingReasonId((cur) => (cur === id ? null : cur));
    });

  const deleteAdjustment = (id: string) =>
    runSave(async () => {
      const supabase = createClient();
      const { error: err } = await supabase.from("prep_list_adjustments").delete().eq("id", id);
      if (err) throw new Error(err.message);
      dropAdjustment(id);
    });

  const suggestions = useMemo(
    () => computeBaseSuggestions({ adjustments: history, locationPrepItems, decisions }),
    [history, locationPrepItems, decisions]
  );

  const decideSuggestion = (
    locationPrepItemId: string,
    prepItemId: string,
    suggestedBase: number,
    decision: "accepted" | "dismissed"
  ) =>
    runSave(async () => {
      const supabase = createClient();
      const { error: err } = await supabase.rpc("decide_prep_base_suggestion", {
        p_location_prep_item_id: locationPrepItemId,
        p_suggested_base: suggestedBase,
        p_decision: decision,
      });
      if (err) throw new Error(err.message);
      setDecisions((prev) => [...prev, { prep_item_id: prepItemId, created_at: new Date().toISOString() }]);
      if (decision === "accepted") {
        setLocationPrepItems((prev) =>
          prev.map((r) => (r.id === locationPrepItemId ? { ...r, base_quantity: suggestedBase } : r))
        );
      }
    });

  const updateCustomTask = (id: string, patch: Partial<PrepListAdjustment>) =>
    runSave(async () => {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("prep_list_adjustments")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (err) throw new Error(err.message);
      mergeAdjustment(data as PrepListAdjustment);
    });

  const handleAddTask = () => {
    const qty = parseQty(addQty);
    if (qty == null) {
      setError("Enter a valid quantity.");
      return;
    }
    if (!addReason) {
      setError("Pick a reason for adding this task.");
      return;
    }
    if (addItemId) {
      const hiddenRow = hiddenRows.find((r) => r.row.prep_item_id === addItemId);
      void upsertItemAdjustment(
        addItemId,
        { make_override: qty, removed: false, reason: addReason },
        hiddenRow
          ? { modelMake: hiddenRow.toMake, modelNeeded: hiddenRow.needed, stock: hiddenRow.currentStock }
          : undefined
      );
      setAddItemId("");
      setAddQty("1");
      setAddReason(null);
      return;
    }
    const name = addName.trim();
    if (!name) {
      setError("Pick a prep item or type a task name.");
      return;
    }
    void runSave(async () => {
      if (!locationId) return;
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("prep_list_adjustments")
        .insert({
          location_id: locationId,
          date,
          custom_name: name,
          custom_unit: addUnit.trim() || null,
          make_override: qty,
          reason: addReason,
          revenue_multiplier: revenueMultiplier,
        })
        .select("*")
        .single();
      if (err) throw new Error(err.message);
      mergeAdjustment(data as PrepListAdjustment);
      setAddName("");
      setAddUnit("");
      setAddQty("1");
      setAddReason(null);
    });
  };

  const addableItems = hiddenRows.filter((r) => !r.override?.removed);

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
        ) : todayRows.length === 0 && tomorrowRows.length === 0 && customTasks.length === 0 && !editing ? (
          <div className="py-8">
            <p className="text-ink-soft/80">No prep items to show, or all items are fully stocked.</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-secondary mt-4 rounded-xl px-4 py-2.5 text-sm font-medium no-print"
            >
              Edit / add task
            </button>
          </div>
        ) : (
          <>
            <ChickpeaSoakCallout kg={soakDryChickpeasKg} />
            <div className="mt-6 flex flex-wrap items-center gap-2 no-print">
              <button
                type="button"
                onClick={handlePrint}
                className="btn-primary rounded-xl px-4 py-2.5 text-sm font-medium"
              >
                Print
              </button>
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className={`${editing ? "btn-accent" : "btn-secondary"} rounded-xl px-4 py-2.5 text-sm font-medium`}
              >
                {editing ? "Done editing" : "Edit"}
              </button>
              {saving && <span className="help-text">Saving…</span>}
            </div>

            {editing && (
              <div className="mt-4 card p-4 no-print space-y-3">
                <p className="text-sm font-medium text-ink">Add task for today</p>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={addItemId}
                    onChange={(e) => {
                      setAddItemId(e.target.value);
                      const r = addableItems.find((x) => x.row.prep_item_id === e.target.value);
                      if (r) setAddUnit(r.row.prep_items?.unit ?? "");
                    }}
                    className="input h-10 min-w-[12rem] flex-1"
                    aria-label="Prep item"
                  >
                    <option value="">Custom task…</option>
                    {addableItems.map((r) => (
                      <option key={r.row.prep_item_id} value={r.row.prep_item_id}>
                        {r.row.prep_items?.name}
                        {r.row.prep_items?.unit ? ` (${r.row.prep_items.unit})` : ""}
                      </option>
                    ))}
                  </select>
                  {!addItemId && (
                    <>
                      <input
                        type="text"
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        placeholder="Task name, e.g. Dust pitas"
                        className="input h-10 min-w-[12rem] flex-1"
                        aria-label="Task name"
                      />
                      <input
                        type="text"
                        value={addUnit}
                        onChange={(e) => setAddUnit(e.target.value)}
                        placeholder="Unit"
                        className="input h-10 w-28"
                        aria-label="Unit"
                      />
                    </>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                    className="input h-10 w-24 text-center"
                    aria-label="Quantity to make"
                  />
                  <button
                    type="button"
                    onClick={handleAddTask}
                    disabled={saving}
                    className="btn-primary h-10 rounded-xl px-4 text-sm font-medium"
                  >
                    Add task
                  </button>
                </div>
                <div>
                  <span className="mb-1 block label">Why?</span>
                  <ReasonChips value={addReason} onPick={setAddReason} disabled={saving} />
                </div>
                <p className="help-text">
                  Pick an item the model left off today, or type a custom task. Changes apply to{" "}
                  <strong>{locationName || "this location"}</strong> on {date} only.
                </p>
                {removedAdjustments.length > 0 && (
                  <div className="border-t border-brand-green/10 pt-3">
                    <p className="mb-1 text-sm font-medium text-ink">Removed today</p>
                    <ul className="space-y-1">
                      {removedAdjustments.map((a) => {
                        const name =
                          a.custom_name ??
                          locationPrepItems.find((r) => r.prep_item_id === a.prep_item_id)?.prep_items?.name ??
                          "Item";
                        return (
                          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="text-ink-soft line-through">{name}</span>
                            {a.prep_item_id && !a.reason && (
                              <ReasonChips value={a.reason} onPick={(r) => void setReason(a.id, r)} disabled={saving} />
                            )}
                            {a.reason && <span className="help-text">{reasonLabel(a.reason)}</span>}
                            <button
                              type="button"
                              onClick={() =>
                                a.prep_item_id
                                  ? void deleteAdjustment(a.id)
                                  : void updateCustomTask(a.id, { removed: false })
                              }
                              className="btn-ghost rounded-lg px-3 py-1 text-xs font-medium"
                            >
                              Restore
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {editing && suggestions.length > 0 && (
              <section className="mt-4 card p-4 no-print space-y-3 border-l-4 border-l-accent-orange">
                <p className="text-sm font-medium text-ink">Suggestions for the manager</p>
                <p className="help-text">
                  The kitchen keeps correcting these items. Accepting changes the base quantity for{" "}
                  <strong>{locationName || "this location"}</strong> from now on; dismissing hides the
                  suggestion until it happens again.
                </p>
                <ul className="space-y-2">
                  {suggestions.map((sg) => (
                    <li
                      key={sg.prepItemId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-sand/30 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {sg.name}
                          {sg.unit ? <span className="help-text"> · {sg.unit}</span> : null}
                        </p>
                        <p className="help-text">
                          Base {formatPrepQuantity(sg.currentBase)} → <strong>{formatPrepQuantity(sg.suggestedBase)}</strong>{" "}
                          · corrected on {sg.occurrences} days (last {sg.dates[0]})
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void decideSuggestion(sg.locationPrepItemId, sg.prepItemId, sg.suggestedBase, "accepted")
                          }
                          className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void decideSuggestion(sg.locationPrepItemId, sg.prepItemId, sg.suggestedBase, "dismissed")
                          }
                          className="btn-ghost rounded-lg px-3 py-1.5 text-xs font-medium"
                        >
                          Dismiss
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="mt-6 space-y-6">
              {todayRows.map(({ row, needed, toMake, priority, currentStock, override, modelToMake }) => {
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
                          {override?.make_override != null && (
                            <span className="ml-1 text-accent-terracotta">(edited)</span>
                          )}
                        </p>
                      </div>
                      {editing && (
                        <div className="flex shrink-0 items-center gap-2 no-print">
                          <MakeInput
                            value={toMake}
                            onCommit={(n) =>
                              void upsertItemAdjustment(
                                item.id,
                                { make_override: n },
                                { modelMake: modelToMake, modelNeeded: needed, stock: currentStock }
                              )
                            }
                            label={`Make: ${item.name}`}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void upsertItemAdjustment(
                                item.id,
                                { removed: true },
                                { modelMake: modelToMake, modelNeeded: needed, stock: currentStock }
                              )
                            }
                            className="btn-ghost rounded-lg px-3 py-2 text-xs font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                    {editing && override && !override.removed && (
                      <div className="mt-3 no-print">
                        {override.reason && pendingReasonId !== override.id ? (
                          <p className="help-text">
                            Reason: {reasonLabel(override.reason)}{" "}
                            <button
                              type="button"
                              onClick={() => setPendingReasonId(override.id)}
                              className="underline"
                            >
                              change
                            </button>
                          </p>
                        ) : (
                          <div className="space-y-1">
                            <span className="label block">Why did you change this?</span>
                            <ReasonChips
                              value={override.reason}
                              onPick={(r) => void setReason(override.id, r)}
                              disabled={saving}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {customTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-brand-green/10 border-l-4 border-l-brand-green bg-brand-sage/25 p-4"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={!!completed[task.id]}
                      onChange={() => toggleDone(task.id)}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-brand-green/15"
                      aria-label={`Done: ${task.custom_name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{task.custom_name}</p>
                      {task.custom_unit && <p className="help-text">{task.custom_unit}</p>}
                      <p className="mt-1 help-text">
                        Make: <strong>{formatPrepQuantity(Number(task.make_override ?? 0))}</strong>
                        <span className="ml-1 text-accent-terracotta">(added by kitchen)</span>
                      </p>
                    </div>
                    {editing && (
                      <div className="flex shrink-0 items-center gap-2 no-print">
                        <MakeInput
                          value={Number(task.make_override ?? 0)}
                          onCommit={(n) => void updateCustomTask(task.id, { make_override: n })}
                          label={`Make: ${task.custom_name}`}
                        />
                        <button
                          type="button"
                          onClick={() => void deleteAdjustment(task.id)}
                          className="btn-ghost rounded-lg px-3 py-2 text-xs font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {tomorrowRows.length > 0 && (
                <section className="border-t border-brand-green/10 pt-6">
                  <h2 className="mb-3 section-title">
                    Tomorrow (overnight)
                  </h2>
                  <div className="space-y-4">
                    {tomorrowRows.map(({ row, needed, toMake, priority, currentStock, override, modelToMake }) => {
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
                                {override?.make_override != null && (
                                  <span className="ml-1 text-accent-terracotta">(edited)</span>
                                )}
                              </p>
                            </div>
                            {editing && (
                              <div className="flex shrink-0 items-center gap-2 no-print">
                                <MakeInput
                                  value={toMake}
                                  onCommit={(n) =>
                                    void upsertItemAdjustment(
                                      item.id,
                                      { make_override: n },
                                      { modelMake: modelToMake, modelNeeded: needed, stock: currentStock }
                                    )
                                  }
                                  label={`Make: ${item.name}`}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    void upsertItemAdjustment(
                                      item.id,
                                      { removed: true },
                                      { modelMake: modelToMake, modelNeeded: needed, stock: currentStock }
                                    )
                                  }
                                  className="btn-ghost rounded-lg px-3 py-2 text-xs font-medium"
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                          {editing && override && !override.removed && (
                            <div className="mt-3 no-print">
                              {override.reason && pendingReasonId !== override.id ? (
                                <p className="help-text">
                                  Reason: {reasonLabel(override.reason)}{" "}
                                  <button
                                    type="button"
                                    onClick={() => setPendingReasonId(override.id)}
                                    className="underline"
                                  >
                                    change
                                  </button>
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  <span className="label block">Why did you change this?</span>
                                  <ReasonChips
                                    value={override.reason}
                                    onPick={(r) => void setReason(override.id, r)}
                                    disabled={saving}
                                  />
                                </div>
                              )}
                            </div>
                          )}
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
