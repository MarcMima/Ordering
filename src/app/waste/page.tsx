"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import { localCalendarDateString, shiftCalendarDateString } from "@/lib/date";
import { formatDecimal2 } from "@/lib/format";
import { baseAmountFromRawMaster } from "@/lib/stocktakeRawPackMath";
import { isRawVisibleOnStocktakeForLocation } from "@/lib/stocktakeVisibility";
import { LOSS_REASONS, lossReasonLabel, type LossReason, type StockLoss } from "@/lib/stockLosses";
import type { RawIngredient } from "@/lib/types";

/**
 * Waste / stock losses: a fridge breaks down, something spoils or falls on the floor. The loss
 * is subtracted from the latest count in the prep list and the order suggestion until the next
 * count (Pijp feedback 09-10, Marc 19-10-2026). Counting units match the stocktake.
 */

type Kind = "prep" | "raw";
type PrepOption = { id: string; name: string };

export default function WastePage() {
  const { locationId } = useLocation();
  const today = localCalendarDateString();
  const [kind, setKind] = useState<Kind>("prep");
  const [rawItems, setRawItems] = useState<RawIngredient[]>([]);
  const [prepItems, setPrepItems] = useState<PrepOption[]>([]);
  const [losses, setLosses] = useState<StockLoss[]>([]);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<LossReason | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!locationId) return;
    const supabase = createClient();
    const [rawRes, prepRes, lossRes] = await Promise.all([
      supabase
        .from("raw_ingredients")
        .select("id, name, unit, location_id, stocktake_visible, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit")
        .eq("location_id", locationId)
        .order("name"),
      supabase
        .from("location_prep_items")
        .select("prep_item_id, prep_items(name, stocktake_visible)")
        .eq("location_id", locationId),
      supabase
        .from("stock_losses")
        .select("*")
        .eq("location_id", locationId)
        .gte("date", shiftCalendarDateString(today, -14))
        .order("created_at", { ascending: false }),
    ]);
    const err = rawRes.error || prepRes.error || lossRes.error;
    if (err) {
      setError(err.message);
      return;
    }
    setRawItems(
      ((rawRes.data as RawIngredient[]) ?? []).filter((r) => isRawVisibleOnStocktakeForLocation(r, locationId))
    );
    const preps = ((prepRes.data ?? []) as unknown as {
      prep_item_id: string;
      prep_items: { name: string; stocktake_visible?: boolean | null } | null;
    }[])
      .filter((r) => r.prep_items && r.prep_items.stocktake_visible !== false)
      .map((r) => ({ id: r.prep_item_id, name: r.prep_items!.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    setPrepItems(preps);
    setLosses((lossRes.data as StockLoss[]) ?? []);
    setError(null);
  }, [locationId, today]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const rawById = useMemo(() => Object.fromEntries(rawItems.map((r) => [r.id, r])), [rawItems]);
  const prepById = useMemo(() => Object.fromEntries(prepItems.map((p) => [p.id, p])), [prepItems]);

  // Raw items are entered in the stocktake unit (e.g. "bag" of 1 kg) and stored in base units.
  const selectedRaw = kind === "raw" ? rawById[itemId] : undefined;
  const rawUnitBase = selectedRaw ? baseAmountFromRawMaster(selectedRaw) : null;
  const unitLabel =
    kind === "prep"
      ? "container"
      : selectedRaw
        ? rawUnitBase != null
          ? (selectedRaw.stocktake_unit_label ?? selectedRaw.unit)
          : selectedRaw.unit
        : "";

  const save = async () => {
    const n = Number(qty.replace(",", "."));
    if (!itemId) return setError("Pick a product.");
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a quantity.");
    if (!reason) return setError("Pick a reason.");
    if (reason === "other" && !note.trim()) return setError("Add a short note for \"Other\".");
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const quantity = kind === "raw" && rawUnitBase != null ? n * rawUnitBase : n;
    const { error: e } = await supabase.from("stock_losses").insert({
      location_id: locationId,
      date: today,
      raw_ingredient_id: kind === "raw" ? itemId : null,
      prep_item_id: kind === "prep" ? itemId : null,
      quantity,
      unit_label: `${formatDecimal2(n)} × ${unitLabel}`,
      reason,
      note: note.trim() || null,
      created_by: auth.user?.email ?? null,
    });
    setSaving(false);
    if (e) return setError(e.message);
    const name = kind === "raw" ? rawById[itemId]?.name : prepById[itemId]?.name;
    setSaved(`Saved: ${formatDecimal2(n)} × ${unitLabel} ${name ?? ""}. Stock is lowered until the next count.`);
    setItemId("");
    setQty("");
    setReason(null);
    setNote("");
    await load();
  };

  const remove = async (id: string) => {
    const supabase = createClient();
    const { error: e } = await supabase.from("stock_losses").delete().eq("id", id);
    if (e) setError(e.message);
    else await load();
  };

  const itemName = (l: StockLoss) =>
    l.prep_item_id ? (prepById[l.prep_item_id]?.name ?? "Prep item") : (rawById[l.raw_ingredient_id ?? ""]?.name ?? "Ingredient");

  const options = kind === "prep" ? prepItems : rawItems.map((r) => ({ id: r.id, name: r.name }));

  return (
    <div className="min-h-screen bg-background font-sans">
      <TopNav />
      <main className="mx-auto max-w-lg px-4 py-8 pb-24 sm:px-6">
        <Link href="/kitchen" className="text-sm text-ink-soft">
          &larr; Kitchen
        </Link>
        <h1 className="mt-2 mb-2 page-title">Waste</h1>
        <p className="mb-6 help-text">
          Record food or stock you had to throw away (fridge broke down, spoiled, dropped). The app takes it
          off the stock until the next count, so the prep list and the order suggestion stay right.
        </p>

        <div className="card space-y-4">
          <div className="flex gap-2">
            {(["prep", "raw"] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setItemId("");
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  kind === k ? "border-brand-green bg-brand-green text-white" : "border-hairline bg-surface text-ink"
                }`}
              >
                {k === "prep" ? "Prep item" : "Ingredient / product"}
              </button>
            ))}
          </div>

          <label className="block text-sm">
            Product
            <select
              className="mt-1 w-full rounded border border-hairline bg-surface px-2 py-2"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
            >
              <option value="">Select…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            Quantity{unitLabel ? ` (${unitLabel})` : ""}
            <input
              inputMode="decimal"
              className="mt-1 w-full rounded border border-hairline bg-surface px-2 py-2"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="e.g. 2"
            />
          </label>

          <div>
            <p className="text-sm">Reason</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {LOSS_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    reason === r.value ? "border-brand-green bg-brand-green text-white" : "border-hairline bg-surface/60 text-ink"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm">
            Note{reason === "other" ? "" : " (optional)"}
            <input
              className="mt-1 w-full rounded border border-hairline bg-surface px-2 py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. walk-in fridge broke down overnight"
            />
          </label>

          {error && <p className="text-sm text-accent-terracotta">{error}</p>}
          {saved && <p className="text-sm text-brand-green">{saved}</p>}
          <button type="button" disabled={saving} onClick={() => void save()} className="btn-primary w-full rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save waste"}
          </button>
        </div>

        <h2 className="mt-8 mb-2 font-medium text-ink">Last 14 days</h2>
        {losses.length === 0 ? (
          <p className="help-text">Nothing recorded.</p>
        ) : (
          <ul className="space-y-2">
            {losses.map((l) => (
              <li key={l.id} className="rounded-lg border border-hairline p-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">{itemName(l)}</span>
                  <span className="text-xs text-ink-soft">{new Date(`${l.date}T12:00:00`).toLocaleDateString("en-GB")}</span>
                </div>
                <p className="text-ink-soft">
                  {l.unit_label ?? formatDecimal2(Number(l.quantity))} · {lossReasonLabel(l.reason)}
                  {l.note ? ` · ${l.note}` : ""}
                </p>
                {l.date === today && (
                  <button type="button" onClick={() => void remove(l.id)} className="mt-1 text-xs text-ink-soft underline">
                    Remove (entered by mistake)
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
