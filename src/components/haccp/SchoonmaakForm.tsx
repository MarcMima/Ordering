"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { HaccpSchoonmaakRow } from "@/lib/haccp/types";
import { useLocation } from "@/contexts/LocationContext";
import { getHaccpStoreId } from "@/lib/haccp/types";
import { WEEKDAY_LABELS_EN_SHORT } from "@/lib/haccp/week";

/** KHN cleaning schedule keys: D=daily W=weekly M=monthly N=after use */
const OBJECTS: { key: keyof HaccpSchoonmaakRow; label: string; frequency: string }[] = [
  { key: "vriezers", label: "Freezers", frequency: "D · M" },
  { key: "verdampers", label: "Evaporators", frequency: "D · M" },
  { key: "magazijnstellingen", label: "Warehouse shelving", frequency: "D · M" },
  { key: "schappen", label: "Shelves / racks", frequency: "D · M" },
  { key: "koelingen", label: "Refrigeration units", frequency: "D" },
  { key: "frituren", label: "Fryers", frequency: "D · W" },
  { key: "afzuiging", label: "Exhaust (incl. filters)", frequency: "D · W" },
  { key: "wanden", label: "Walls", frequency: "D · W" },
  { key: "bain_marie", label: "Bain-marie", frequency: "D · W" },
  { key: "saladiere", label: "Salad bars", frequency: "D" },
  { key: "grill", label: "Grill", frequency: "D" },
  { key: "werkbanken", label: "Work tables", frequency: "D" },
  { key: "vloer", label: "Floor", frequency: "D" },
  { key: "vaatwasser", label: "Dishwasher", frequency: "D" },
  { key: "afvalbakken", label: "Waste bins", frequency: "D" },
  { key: "schoonmaakmateriaal", label: "Cleaning supplies", frequency: "D" },
  { key: "handcontactpunten", label: "High-touch surfaces", frequency: "D" },
  { key: "handenwas", label: "Hand-wash station", frequency: "D" },
  { key: "spoelbakken", label: "Sinks", frequency: "D" },
  { key: "magnetron", label: "Microwave", frequency: "D · N" },
  { key: "snijgereedschap", label: "Cutting tools", frequency: "D · N" },
  { key: "snijplanken", label: "Cutting boards", frequency: "D · N" },
  { key: "keukenmachines", label: "Kitchen machines", frequency: "D · N" },
  { key: "kleine_materialen", label: "Small production items", frequency: "D · N" },
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

function emptyWeek(): (boolean | null)[] {
  return Array.from({ length: 7 }, () => null);
}

function rowFromInitial(
  initial: Partial<HaccpSchoonmaakRow> | null,
  emptyFn: () => (boolean | null)[]
): Record<string, (boolean | null)[] | string | number | null> {
  const base: Record<string, (boolean | null)[] | string | null> = {
    uitgevoerd_door: initial?.uitgevoerd_door ?? "",
  };
  for (const o of OBJECTS) {
    base[o.key] = initial?.[o.key] ? bool7(initial[o.key]) : emptyFn();
  }
  return base;
}

export function SchoonmaakForm({
  weekNumber,
  year,
  initial,
  onSaved,
}: {
  weekNumber: number;
  year: number;
  initial: Partial<HaccpSchoonmaakRow> | null;
  onSaved?: () => void;
}) {
  const { locations, locationId } = useLocation();
  const storeId = getHaccpStoreId(locations, locationId);

  const [row, setRow] = useState<Record<string, (boolean | null)[] | string | number | null>>(() =>
    rowFromInitial(initial, emptyWeek)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setRow(rowFromInitial(initial, emptyWeek));
  }, [initial, weekNumber, year]);

  function setDay(key: string, day: number) {
    setRow((prev) => {
      const arr = [...((prev[key] as (boolean | null)[]) ?? emptyWeek())];
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
    else {
      setMessage("Saved.");
      onSaved?.();
    }
  }

  return (
    <div className="space-y-6">
      <p className="help-text">
        Tap each cell: · → ✓ → ✗ → · (n/a / clean / not clean). Frequentie volgens schoonmaakschema (D=dagelijks,
        W=wekelijks, M=maandelijks, N=na gebruik).
      </p>
      <div className="overflow-x-auto rounded-xl border border-brand-green/10">
        <table className="w-full min-w-[980px] border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-brand-green/10 bg-background">
              <th className="sticky left-0 z-10 bg-background px-2 py-2 text-left font-medium">
                Object
              </th>
              <th className="whitespace-nowrap px-1 py-2 text-left text-[11px] font-medium text-ink-soft">
                Freq.
              </th>
              {WEEKDAY_LABELS_EN_SHORT.map((d) => (
                <th key={d} className="min-w-[2.5rem] px-0.5 py-2 text-center font-medium text-ink-soft">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OBJECTS.map((o) => (
              <tr key={o.key} className="border-b border-brand-green/10">
                <td className="sticky left-0 z-10 bg-surface px-2 py-1 font-medium text-ink">
                  {o.label}
                </td>
                <td className="whitespace-nowrap px-1 py-1 text-[10px] leading-tight text-ink-soft/80">
                  {o.frequency}
                </td>
                {WEEKDAY_LABELS_EN_SHORT.map((_, day) => {
                  const arr = (row[o.key] as (boolean | null)[]) ?? emptyWeek();
                  const v = arr[day];
                  return (
                    <td key={day} className="p-0.5 text-center">
                      <button
                        type="button"
                        title="Tap to cycle"
                        onClick={() => setDay(o.key, day)}
                        className={`h-9 w-full rounded-md border text-base font-semibold ${ v === true ? "border-brand-green bg-brand-sage/25 text-brand-green" : v === false ? "border-accent-terracotta bg-brand-sand/40 text-accent-terracotta" : "border-brand-green/10 bg-background text-ink-soft/60 " }`}
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
        <span className="mb-1 block font-medium text-ink">Completed by</span>
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
          className="btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message && <span className="help-text">{message}</span>}
      </div>
    </div>
  );
}
