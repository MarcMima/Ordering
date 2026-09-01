"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import { localCalendarDateString } from "@/lib/date";
import { formatDecimal2 } from "@/lib/format";
import { adjustmentReasonLabel } from "@/lib/orderAdjustments";

/**
 * Terugkijkweergave per datum: de telling, de bestelsuggestie zoals die er tóen stond,
 * en de daadwerkelijk verstuurde bestelling ernaast.
 *
 * Strikt read-only. De suggestie wordt bewust NIET herberekend maar uit
 * order_suggestion_snapshots gelezen: een herberekening met de config van vandaag laat
 * iets anders zien dan wat de manager destijds op het scherm had. Om dezelfde reden
 * roept deze pagina ensureEffectiveDailyRevenueTargetCents niet aan — die functie
 * schrijft een carry-forward weg (write-on-read) en heeft hier niets te zoeken.
 */

type SnapshotLine = {
  raw_ingredient_id: string;
  name: string;
  supplier_id: string | null;
  suggested_base_qty: number;
  suggested_packs: number;
  pack_multiple: number;
  days_cover: number;
  stock_at_count: number;
  daily_need: number;
};

type OrderLineRow = {
  id: string;
  raw_ingredient_id: string;
  quantity: number;
  suggested_base_qty: number | null;
  adjustment_reason: string | null;
  adjustment_note: string | null;
};

type OrderRow = {
  id: string;
  supplier_id: string;
  status: string | null;
  created_at: string | null;
  order_line_items: OrderLineRow[] | null;
};

type StockCountRow = { raw_ingredient_id: string; quantity: number };
type PrepCountRow = { prep_item_id: string; quantity: number; prep_items: { name: string } | null };

type HistoryData = {
  snapshotLines: SnapshotLine[] | null;
  snapshotCreatedAt: string | null;
  orders: OrderRow[];
  stockCounts: StockCountRow[];
  prepCounts: PrepCountRow[];
  rawNameById: Record<string, string>;
  rawUnitById: Record<string, string>;
  supplierNameById: Record<string, string>;
};

function OrderingHistory() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locationId, locationOptions } = useLocation();

  const today = useMemo(() => localCalendarDateString(), []);
  const dateParam = searchParams.get("date");
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;

  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setDate = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", next);
      router.replace(`/ordering/history?${params.toString()}`);
    },
    [router, searchParams]
  );

  useEffect(() => {
    if (!locationId) {
      setData(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);

    void (async () => {
      const supabase = createClient();
      const [snapRes, ordersRes, stockRes, prepRes, rawRes, supRes] = await Promise.all([
        supabase
          .from("order_suggestion_snapshots")
          .select("lines, created_at")
          .eq("location_id", locationId)
          .eq("date", date)
          .maybeSingle(),
        supabase
          .from("orders")
          .select(
            "id, supplier_id, status, created_at, order_line_items ( id, raw_ingredient_id, quantity, suggested_base_qty, adjustment_reason, adjustment_note )"
          )
          .eq("location_id", locationId)
          .eq("order_date", date),
        supabase
          .from("daily_stock_counts")
          .select("raw_ingredient_id, quantity")
          .eq("location_id", locationId)
          .eq("date", date),
        supabase
          .from("daily_prep_counts")
          .select("prep_item_id, quantity, prep_items ( name )")
          .eq("location_id", locationId)
          .eq("date", date),
        supabase.from("raw_ingredients").select("id, name, unit").eq("location_id", locationId),
        supabase.from("suppliers").select("id, name").eq("location_id", locationId),
      ]);

      if (!alive) return;

      // Eén mislukte deelquery maakt de pagina misleidend (lege secties die "niets
      // besteld" suggereren), dus melden in plaats van stilzwijgend doorgaan.
      const failures = [snapRes, ordersRes, stockRes, prepRes, rawRes, supRes]
        .map((r) => r.error?.message)
        .filter(Boolean);
      if (failures.length > 0) {
        setError(failures.join(" · "));
        setData(null);
        setLoading(false);
        return;
      }

      const rawRows = (rawRes.data as { id: string; name: string; unit: string | null }[]) ?? [];
      const supRows = (supRes.data as { id: string; name: string }[]) ?? [];
      const snapRow = snapRes.data as { lines: SnapshotLine[] | null; created_at: string } | null;

      setData({
        snapshotLines: snapRow?.lines ?? null,
        snapshotCreatedAt: snapRow?.created_at ?? null,
        orders: (ordersRes.data as OrderRow[]) ?? [],
        stockCounts: (stockRes.data as StockCountRow[]) ?? [],
        prepCounts: (prepRes.data as unknown as PrepCountRow[]) ?? [],
        rawNameById: Object.fromEntries(rawRows.map((r) => [r.id, r.name])),
        rawUnitById: Object.fromEntries(rawRows.map((r) => [r.id, r.unit ?? ""])),
        supplierNameById: Object.fromEntries(supRows.map((s) => [s.id, s.name])),
      });
      setLoading(false);
    })().catch(() => {
      if (!alive) return;
      setError("Kon de gegevens van deze dag niet laden.");
      setData(null);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [locationId, date]);

  const locationName = locationOptions.find((l) => l.id === locationId)?.name ?? "";
  const isPast = date < today;

  /** Per grondstof: wat de suggestie zei naast wat er daadwerkelijk besteld is. */
  const comparison = useMemo(() => {
    if (!data) return [];
    const orderedByRaw: Record<
      string,
      { quantity: number; supplierIds: Set<string>; reason: string | null; note: string | null }
    > = {};
    for (const order of data.orders) {
      for (const line of order.order_line_items ?? []) {
        const entry = (orderedByRaw[line.raw_ingredient_id] ??= {
          quantity: 0,
          supplierIds: new Set<string>(),
          reason: null,
          note: null,
        });
        entry.quantity += Number(line.quantity) || 0;
        entry.supplierIds.add(order.supplier_id);
        // Eén grondstof kan over meerdere regels besteld zijn; de eerste ingevulde
        // reden geldt voor de grondstof als geheel.
        entry.reason ??= line.adjustment_reason;
        entry.note ??= line.adjustment_note;
      }
    }

    const rawIds = new Set<string>([
      ...(data.snapshotLines ?? []).map((l) => l.raw_ingredient_id),
      ...Object.keys(orderedByRaw),
    ]);

    return Array.from(rawIds)
      .map((rawId) => {
        const snap = (data.snapshotLines ?? []).find((l) => l.raw_ingredient_id === rawId);
        const ordered = orderedByRaw[rawId];
        const supplierIds = snap?.supplier_id
          ? [snap.supplier_id]
          : Array.from(ordered?.supplierIds ?? []);
        return {
          rawId,
          name: snap?.name || data.rawNameById[rawId] || "(onbekend)",
          supplierNames: supplierIds
            .map((id) => data.supplierNameById[id])
            .filter(Boolean)
            .join(", "),
          suggestedPacks: snap?.suggested_packs ?? null,
          suggestedBaseQty: snap?.suggested_base_qty ?? null,
          daysCover: snap?.days_cover ?? null,
          stockAtCount: snap?.stock_at_count ?? null,
          dailyNeed: snap?.daily_need ?? null,
          orderedQuantity: ordered?.quantity ?? null,
          reason: adjustmentReasonLabel(ordered?.reason),
          note: ordered?.note ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "nl", { sensitivity: "base" }));
  }, [data]);

  const prepCountRows = useMemo(() => {
    if (!data) return [];
    return [...data.prepCounts].sort((a, b) =>
      (a.prep_items?.name ?? "").localeCompare(b.prep_items?.name ?? "", "nl", {
        sensitivity: "base",
      })
    );
  }, [data]);

  const stockCountRows = useMemo(() => {
    if (!data) return [];
    return [...data.stockCounts]
      .map((row) => ({
        ...row,
        name: data.rawNameById[row.raw_ingredient_id] ?? "(onbekend)",
        unit: data.rawUnitById[row.raw_ingredient_id] ?? "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "nl", { sensitivity: "base" }));
  }, [data]);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-ink">Terugkijken per dag</h1>
            <p className="help-text">
              {locationName ? `${locationName} — ` : ""}telling, suggestie van toen en de
              verstuurde bestelling. Alleen lezen.
            </p>
          </div>
          <Link href="/ordering" className="btn-ghost text-sm">
            Naar bestellen
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-ink" htmlFor="history-date">
            Datum
          </label>
          <input
            id="history-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-brand-green/15 bg-surface px-2 py-1 text-sm text-ink"
          />
          {isPast && (
            <span className="rounded-full bg-brand-sand/60 px-2 py-0.5 text-xs text-ink-soft">
              Verleden — read-only
            </span>
          )}
        </div>

        {!locationId && (
          <p className="mt-6 text-sm text-ink-soft">Kies eerst een locatie.</p>
        )}
        {locationId && loading && <p className="mt-6 text-sm text-ink-soft">Laden…</p>}
        {error && (
          <p className="mt-6 alert-error rounded-lg px-3 py-2 text-sm">
            Kon de gegevens niet laden: {error}
          </p>
        )}

        {locationId && !loading && !error && data && (
          <>
            <section className="mt-6">
              <h2 className="font-semibold text-ink">Gesuggereerd vs besteld</h2>
              {data.snapshotLines == null && (
                <p className="help-text mt-1">
                  Geen suggestie-snapshot voor deze dag. Snapshots worden vastgelegd vanaf het
                  moment dat deze functie live ging; voor eerdere dagen is alleen de verstuurde
                  bestelling bekend.
                </p>
              )}
              {data.snapshotCreatedAt && (
                <p className="help-text mt-1">
                  Snapshot vastgelegd op{" "}
                  {new Date(data.snapshotCreatedAt).toLocaleString("nl-NL")}.
                </p>
              )}
              {comparison.length === 0 ? (
                <p className="help-text mt-2">Niets gesuggereerd en niets besteld op deze dag.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead>
                      <tr className="border-b border-brand-green/15 text-left text-xs text-ink-soft">
                        <th className="py-1.5 pr-2 font-medium">Grondstof</th>
                        <th className="py-1.5 pr-2 font-medium">Leverancier</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Gesuggereerd</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Besteld</th>
                        <th className="py-1.5 pr-2 font-medium">Reden</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Voorraad</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Behoefte/dag</th>
                        <th className="py-1.5 text-right font-medium">Dagen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map((row) => {
                        const deviates =
                          row.suggestedPacks != null &&
                          row.orderedQuantity != null &&
                          row.orderedQuantity !== row.suggestedPacks;
                        return (
                          <tr
                            key={row.rawId}
                            className="border-b border-brand-green/5 align-top"
                          >
                            <td className="py-1.5 pr-2 font-medium text-ink">{row.name}</td>
                            <td className="py-1.5 pr-2 text-ink-soft">
                              {row.supplierNames || "—"}
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-ink-soft">
                              {row.suggestedPacks ?? "—"}
                            </td>
                            <td
                              className={
                                deviates
                                  ? "py-1.5 pr-2 text-right font-semibold tabular-nums text-accent-terracotta"
                                  : "py-1.5 pr-2 text-right tabular-nums text-ink"
                              }
                            >
                              {row.orderedQuantity ?? "—"}
                            </td>
                            <td className="py-1.5 pr-2 text-xs text-ink-soft">
                              {row.reason ?? (deviates ? "geen reden opgegeven" : "—")}
                              {row.note ? ` — ${row.note}` : ""}
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-ink-soft">
                              {row.stockAtCount != null ? formatDecimal2(row.stockAtCount) : "—"}
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-ink-soft">
                              {row.dailyNeed != null ? formatDecimal2(row.dailyNeed) : "—"}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-ink-soft">
                              {row.daysCover ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="mt-8">
              <h2 className="font-semibold text-ink">Verstuurde bestellingen</h2>
              {data.orders.length === 0 ? (
                <p className="help-text mt-2">Geen bestelling verstuurd op deze dag.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {data.orders.map((order) => (
                    <li key={order.id} className="text-sm text-ink-soft">
                      <span className="font-medium text-ink">
                        {data.supplierNameById[order.supplier_id] ?? "(onbekende leverancier)"}
                      </span>{" "}
                      — {(order.order_line_items ?? []).length} regel
                      {(order.order_line_items ?? []).length === 1 ? "" : "s"}
                      {order.status ? ` · ${order.status}` : ""}
                      {order.created_at
                        ? ` · ${new Date(order.created_at).toLocaleTimeString("nl-NL", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-8">
              <h2 className="font-semibold text-ink">Telling grondstoffen</h2>
              {stockCountRows.length === 0 ? (
                <p className="help-text mt-2">Geen telling geregistreerd op deze dag.</p>
              ) : (
                <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {stockCountRows.map((row) => (
                    <li
                      key={row.raw_ingredient_id}
                      className="flex justify-between gap-3 border-b border-brand-green/5 py-1 text-sm"
                    >
                      <span className="text-ink">{row.name}</span>
                      <span className="tabular-nums text-ink-soft">
                        {formatDecimal2(row.quantity)} {row.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-8 pb-10">
              <h2 className="font-semibold text-ink">Telling prep</h2>
              {prepCountRows.length === 0 ? (
                <p className="help-text mt-2">Geen preptelling geregistreerd op deze dag.</p>
              ) : (
                <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {prepCountRows.map((row) => (
                    <li
                      key={row.prep_item_id}
                      className="flex justify-between gap-3 border-b border-brand-green/5 py-1 text-sm"
                    >
                      <span className="text-ink">{row.prep_items?.name ?? "(onbekend)"}</span>
                      <span className="tabular-nums text-ink-soft">
                        {formatDecimal2(row.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function OrderingHistoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <OrderingHistory />
    </Suspense>
  );
}
