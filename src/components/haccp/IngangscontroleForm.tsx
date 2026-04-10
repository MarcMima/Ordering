"use client";

import { useMemo, useState } from "react";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import type { HaccpIngangscontroleRow } from "@/lib/haccp/types";
import { getHaccpStoreId } from "@/lib/haccp/types";

const SUPPLIERS = ["Bidfood", "Van Gelder"] as const;
const ROWS_PER_SUPPLIER = 5;

type Soort = "V" | "C" | "D";

type DraftRow = Omit<HaccpIngangscontroleRow, "id" | "created_at">;

function normalizeSupplier(leverancier: string): (typeof SUPPLIERS)[number] | null {
  const t = leverancier.trim().toLowerCase();
  if (t.includes("bidfood")) return "Bidfood";
  if (t.includes("gelder")) return "Van Gelder";
  return null;
}

function defaultDatum(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyRow(
  supplier: (typeof SUPPLIERS)[number],
  lineSlot: number,
  week: number,
  year: number,
  storeId: number,
  datum: string
): DraftRow {
  return {
    store_id: storeId,
    week_number: week,
    year,
    datum,
    leverancier: supplier,
    line_slot: lineSlot,
    product: "",
    soort: "V",
    temperatuur: null,
    verpakking_ok: null,
    tht_ok: null,
    correct: null,
    opmerkingen: null,
    paraaf: null,
    use_by_date: null,
  };
}

function buildDefaultRows(
  week: number,
  year: number,
  storeId: number,
  datum: string
): DraftRow[] {
  const out: DraftRow[] = [];
  for (const supplier of SUPPLIERS) {
    for (let slot = 0; slot < ROWS_PER_SUPPLIER; slot++) {
      out.push(emptyRow(supplier, slot, week, year, storeId, datum));
    }
  }
  return out;
}

function mergeInitial(
  initialRows: HaccpIngangscontroleRow[],
  week: number,
  year: number,
  storeId: number
): DraftRow[] {
  const datum =
    initialRows.find((r) => r.datum)?.datum?.slice(0, 10) ?? defaultDatum();
  const base = buildDefaultRows(week, year, storeId, datum);

  for (const supplier of SUPPLIERS) {
    const bucket = initialRows
      .filter((r) => normalizeSupplier(r.leverancier) === supplier)
      .sort((a, b) => {
        if (a.line_slot != null && b.line_slot != null) return a.line_slot - b.line_slot;
        if (a.line_slot != null) return -1;
        if (b.line_slot != null) return 1;
        return String(a.id).localeCompare(String(b.id));
      });
    for (let slot = 0; slot < ROWS_PER_SUPPLIER; slot++) {
      const src = bucket[slot];
      if (!src) continue;
      const idx = SUPPLIERS.indexOf(supplier) * ROWS_PER_SUPPLIER + slot;
      const { id: _id, created_at: _c, ...rest } = src;
      base[idx] = {
        ...base[idx],
        ...rest,
        leverancier: supplier,
        line_slot: slot,
        week_number: week,
        year,
        store_id: storeId,
        datum: src.datum?.slice(0, 10) ?? datum,
        use_by_date: src.use_by_date?.slice(0, 10) ?? null,
      };
    }
  }

  return base;
}

const TYPE_OPTIONS: { value: Soort; label: string }[] = [
  { value: "V", label: "Fresh" },
  { value: "D", label: "Frozen" },
  { value: "C", label: "Dry" },
];

export function IngangscontroleForm({
  weekNumber,
  year,
  initialRows,
}: {
  weekNumber: number;
  year: number;
  initialRows: HaccpIngangscontroleRow[];
}) {
  const { locations, locationId } = useLocation();
  const storeId = getHaccpStoreId(locations, locationId);

  const merged = useMemo(
    () => mergeInitial(initialRows, weekNumber, year, storeId),
    [initialRows, weekNumber, year, storeId]
  );

  const [rows, setRows] = useState<DraftRow[]>(merged);
  const [checkDate, setCheckDate] = useState(() => merged[0]?.datum?.slice(0, 10) ?? defaultDatum());
  const [signOff, setSignOff] = useState(() => merged.find((r) => r.paraaf)?.paraaf ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateFlat(index: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("haccp_ingangscontrole")
      .delete()
      .eq("store_id", storeId)
      .eq("week_number", weekNumber)
      .eq("year", year);
    if (delErr) {
      setSaving(false);
      setMessage(delErr.message);
      return;
    }

    const payload = rows.map((r) => ({
      ...r,
      store_id: storeId,
      week_number: weekNumber,
      year,
      datum: checkDate,
      paraaf: signOff.trim() || null,
      tht_ok: r.tht_ok,
      use_by_date: null,
    }));

    const { error } = await supabase.from("haccp_ingangscontrole").insert(payload);
    setSaving(false);
    if (error) setMessage(error.message);
    else setMessage("Saved.");
  }

  function renderTable(supplierIndex: 0 | 1) {
    const supplier = SUPPLIERS[supplierIndex];
    const offset = supplierIndex * ROWS_PER_SUPPLIER;

    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{supplier}</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-600 dark:bg-zinc-800/90">
                <th className="px-2 py-2 font-medium text-zinc-700 dark:text-zinc-200">#</th>
                <th className="px-2 py-2 font-medium text-zinc-700 dark:text-zinc-200">Product</th>
                <th className="px-2 py-2 font-medium text-zinc-700 dark:text-zinc-200">Type</th>
                <th className="px-2 py-2 font-medium text-zinc-700 dark:text-zinc-200">Temperature (°C)</th>
                <th className="px-2 py-2 font-medium text-zinc-700 dark:text-zinc-200">Packaging</th>
                <th className="px-2 py-2 font-medium text-zinc-700 dark:text-zinc-200">Use by date</th>
                <th className="px-2 py-2 font-medium text-zinc-700 dark:text-zinc-200">Correct</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS_PER_SUPPLIER }, (_, j) => {
                const i = offset + j;
                const r = rows[i];
                return (
                  <tr key={`${supplier}-${j}`} className="border-b border-zinc-100 dark:border-zinc-700/80">
                    <td className="px-2 py-1.5 tabular-nums text-zinc-500">{j + 1}</td>
                    <td className="p-1">
                      <input
                        className="input w-full min-w-[8rem] py-1 text-sm"
                        value={r.product}
                        onChange={(e) => updateFlat(i, { product: e.target.value })}
                        placeholder="—"
                      />
                    </td>
                    <td className="p-1">
                      <select
                        className="input w-full min-w-[5.5rem] py-1 text-sm"
                        value={r.soort}
                        onChange={(e) => updateFlat(i, { soort: e.target.value as Soort })}
                      >
                        {TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input w-full min-w-[4rem] py-1 text-sm tabular-nums"
                        value={r.temperatuur ?? ""}
                        onChange={(e) => {
                          const t = e.target.value.trim();
                          updateFlat(i, {
                            temperatuur: t === "" ? null : Number(t.replace(",", ".")),
                          });
                        }}
                        placeholder="—"
                      />
                    </td>
                    <td className="p-1">
                      <select
                        className="input w-full min-w-[5rem] py-1 text-sm"
                        value={r.verpakking_ok === null ? "" : r.verpakking_ok ? "1" : "0"}
                        onChange={(e) =>
                          updateFlat(i, {
                            verpakking_ok: e.target.value === "" ? null : e.target.value === "1",
                          })
                        }
                      >
                        <option value="">—</option>
                        <option value="1">OK</option>
                        <option value="0">Not OK</option>
                      </select>
                    </td>
                    <td className="p-1">
                      <select
                        className="input w-full min-w-[5rem] py-1 text-sm"
                        value={r.tht_ok === null ? "" : r.tht_ok ? "1" : "0"}
                        onChange={(e) =>
                          updateFlat(i, {
                            tht_ok: e.target.value === "" ? null : e.target.value === "1",
                            use_by_date: null,
                          })
                        }
                      >
                        <option value="">—</option>
                        <option value="1">OK</option>
                        <option value="0">Not OK</option>
                      </select>
                    </td>
                    <td className="p-1">
                      <select
                        className="input w-full min-w-[5rem] py-1 text-sm"
                        value={r.correct === null ? "" : r.correct ? "1" : "0"}
                        onChange={(e) =>
                          updateFlat(i, {
                            correct: e.target.value === "" ? null : e.target.value === "1",
                          })
                        }
                      >
                        <option value="">—</option>
                        <option value="1">Yes</option>
                        <option value="0">No</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Five products per supplier: Bidfood and Van Gelder. One check date applies to all lines.
      </p>

      <label className="block max-w-xs text-sm">
        <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">Check date</span>
        <input
          type="date"
          className="input w-full"
          value={checkDate}
          onChange={(e) => {
            const d = e.target.value;
            setCheckDate(d);
            setRows((prev) => prev.map((r) => ({ ...r, datum: d })));
          }}
        />
      </label>

      {renderTable(0)}
      {renderTable(1)}

      <label className="block max-w-sm text-sm">
        <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">Sign-off (initials)</span>
        <input
          className="input w-full"
          value={signOff}
          onChange={(e) => setSignOff(e.target.value)}
          placeholder="Optional"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message && <span className="text-sm text-zinc-600 dark:text-zinc-300">{message}</span>}
      </div>
    </div>
  );
}
