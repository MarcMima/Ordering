"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import type { HaccpSchoonmaakRow } from "@/lib/haccp/types";
import { useLocation } from "@/contexts/LocationContext";
import { getHaccpStoreId } from "@/lib/haccp/types";
import { WEEKDAY_LABELS_EN_SHORT } from "@/lib/haccp/week";

const OBJECTS: { key: keyof HaccpSchoonmaakRow; label: string }[] = [
  { key: "vriezers", label: "Freezers" },
  { key: "verdampers", label: "Evaporators" },
  { key: "magazijnstellingen", label: "Warehouse shelving" },
  { key: "schappen", label: "Shelves" },
  { key: "koelingen", label: "Cooling units" },
  { key: "frituren", label: "Fryers" },
  { key: "afzuiging", label: "Extraction" },
  { key: "wanden", label: "Walls" },
  { key: "bain_marie", label: "Bain-marie" },
  { key: "saladiere", label: "Salad bar" },
  { key: "grill", label: "Grill" },
  { key: "werkbanken", label: "Work benches" },
  { key: "vloer", label: "Floor" },
  { key: "vaatwasser", label: "Dishwasher" },
  { key: "afvalbakken", label: "Waste bins" },
  { key: "schoonmaakmateriaal", label: "Cleaning supplies" },
  { key: "handcontactpunten", label: "Hand-touch points" },
  { key: "handenwas", label: "Hand wash" },
  { key: "spoelbakken", label: "Sinks" },
  { key: "magnetron", label: "Microwave" },
  { key: "snijgereedschap", label: "Cutting tools" },
  { key: "snijplanken", label: "Cutting boards" },
  { key: "keukenmachines", label: "Kitchen machines" },
  { key: "kleine_materialen", label: "Small items" },
];

function bool7(v: unknown): (boolean | null)[] {
  const a = Array.isArray(v) ? v : [];
  return Array.from({ length: 7 }, (_, i) => {
    const x = a[i];
    if (x === null || x === undefined) return null;
    return Boolean(x);
  });
}

function nextTri(v: boolean | null): boolean | null {
  if (v === null) return true;
  if (v === true) return false;
  return null;
}

function triLabel(v: boolean | null): string {
  if (v === true) return "✓";
  if (v === false) return "✗";
  return "·";
}

export function SchoonmaakForm({
  weekNumber,
  year,
  initial,
}: {
  weekNumber: number;
  year: number;
  initial: Partial<HaccpSchoonmaakRow> | null;
}) {
  const { locations, locationId } = useLocation();
  const storeId = getHaccpStoreId(locations, locationId);
  const empty = (): (boolean | null)[] => Array.from({ length: 7 }, () => null);

  const [row, setRow] = useState<Record<string, (boolean | null)[] | string | number | null>>(() => {
    const base: Record<string, (boolean | null)[] | string | null> = {
      uitgevoerd_door: initial?.uitgevoerd_door ?? "",
    };
    for (const o of OBJECTS) {
      base[o.key] = initial?.[o.key] ? bool7(initial[o.key]) : empty();
    }
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function setDay(key: string, day: number) {
    setRow((prev) => {
      const arr = [...((prev[key] as (boolean | null)[]) ?? empty())];
      arr[day] = nextTri(arr[day] ?? null);
      return { ...prev, [key]: arr };
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      store_id: storeId,
      week_number: weekNumber,
      year,
      uitgevoerd_door: (row.uitgevoerd_door as string) || null,
      updated_at: new Date().toISOString(),
    };
    for (const o of OBJECTS) {
      payload[o.key] = row[o.key];
    }
    const { error } = await supabase.from("haccp_schoonmaak").upsert(payload, {
      onConflict: "store_id,week_number,year",
    });
    setSaving(false);
    if (error) setMessage(error.message);
    else setMessage("Saved.");
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Tap each cell: · → ✓ → ✗ → · (n/a / clean / not clean).
      </p>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[900px] border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/80">
              <th className="sticky left-0 z-10 bg-zinc-50 px-2 py-2 text-left font-medium dark:bg-zinc-800">
                Area
              </th>
              {WEEKDAY_LABELS_EN_SHORT.map((d) => (
                <th key={d} className="min-w-[2.5rem] px-0.5 py-2 text-center font-medium text-zinc-600">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OBJECTS.map((o) => (
              <tr key={o.key} className="border-b border-zinc-100 dark:border-zinc-700/80">
                <td className="sticky left-0 z-10 bg-white px-2 py-1 font-medium text-zinc-800 dark:bg-zinc-900">
                  {o.label}
                </td>
                {WEEKDAY_LABELS_EN_SHORT.map((_, day) => {
                  const arr = (row[o.key] as (boolean | null)[]) ?? empty();
                  const v = arr[day];
                  return (
                    <td key={day} className="p-0.5 text-center">
                      <button
                        type="button"
                        title="Tap to cycle"
                        onClick={() => setDay(o.key, day)}
                        className={`h-9 w-full rounded-md border text-base font-semibold ${
                          v === true
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100"
                            : v === false
                              ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
                              : "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-500"
                        }`}
                      >
                        {triLabel(v)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">Completed by</span>
        <input
          className="input"
          value={(row.uitgevoerd_door as string) ?? ""}
          onChange={(e) => setRow((r) => ({ ...r, uitgevoerd_door: e.target.value }))}
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
