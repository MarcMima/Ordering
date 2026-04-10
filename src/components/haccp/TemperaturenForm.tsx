"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { HaccpTemperaturenRow } from "@/lib/haccp/types";
import { HACCP_STORE_ID } from "@/lib/haccp/types";
import { WEEKDAY_LABELS_NL } from "@/lib/haccp/week";

const EQUIPMENT: {
  key: keyof Pick<
    HaccpTemperaturenRow,
    | "koelcel_1"
    | "koelcel_2"
    | "vriezer_1"
    | "vriezer_2"
    | "vriezer_ijs"
    | "koelwerkbank_1"
    | "koelwerkbank_2"
    | "koelwerkbank_3"
    | "saladiere_1"
    | "saladiere_2"
  >;
  label: string;
  kind: "cold" | "freezer";
}[] = [
  { key: "koelcel_1", label: "Koelcel 1", kind: "cold" },
  { key: "koelcel_2", label: "Koelcel 2", kind: "cold" },
  { key: "vriezer_1", label: "Vriezer 1", kind: "freezer" },
  { key: "vriezer_2", label: "Vriezer 2", kind: "freezer" },
  { key: "vriezer_ijs", label: "Vriezer ijs", kind: "freezer" },
  { key: "koelwerkbank_1", label: "Koelwerkbank 1", kind: "cold" },
  { key: "koelwerkbank_2", label: "Koelwerkbank 2", kind: "cold" },
  { key: "koelwerkbank_3", label: "Koelwerkbank 3", kind: "cold" },
  { key: "saladiere_1", label: "Saladière 1", kind: "cold" },
  { key: "saladiere_2", label: "Saladière 2", kind: "cold" },
];

function normViolation(kind: "cold" | "freezer", v: number | null): boolean {
  if (v == null || !Number.isFinite(v)) return false;
  if (kind === "cold") return v > 7;
  return v > -18;
}

function numArr7(v: unknown): (number | null)[] {
  const a = Array.isArray(v) ? v : [];
  return Array.from({ length: 7 }, (_, i) => {
    const x = a[i];
    if (x === null || x === undefined || x === "") return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  });
}

function boolArr7(v: unknown): (boolean | null)[] {
  const a = Array.isArray(v) ? v : [];
  return Array.from({ length: 7 }, (_, i) => {
    const x = a[i];
    if (x === null || x === undefined) return null;
    return Boolean(x);
  });
}

function emptyRow(): HaccpTemperaturenRow {
  const z = () => Array.from({ length: 7 }, () => null as number | null);
  const b = () => Array.from({ length: 7 }, () => null as boolean | null);
  return {
    store_id: HACCP_STORE_ID(),
    week_number: 1,
    year: new Date().getFullYear(),
    koelcel_1: z(),
    koelcel_2: z(),
    vriezer_1: z(),
    vriezer_2: z(),
    vriezer_ijs: z(),
    koelwerkbank_1: z(),
    koelwerkbank_2: z(),
    koelwerkbank_3: z(),
    saladiere_1: z(),
    saladiere_2: z(),
    vaatwasser_wastemperatuur: null,
    vaatwasser_naspoeltemp: null,
    opmerkingen: null,
    paraaf: null,
    tht_fifo_ok: b(),
    afgedekt_ok: b(),
    schoonmaak_ok: b(),
  };
}

export function TemperaturenForm({
  weekNumber,
  year,
  initial,
}: {
  weekNumber: number;
  year: number;
  initial: HaccpTemperaturenRow | null;
}) {
  const storeId = HACCP_STORE_ID();
  const [row, setRow] = useState<HaccpTemperaturenRow>(() => {
    const base = emptyRow();
    base.week_number = weekNumber;
    base.year = year;
    base.store_id = storeId;
    if (!initial) {
      return base;
    }
    return {
      ...base,
      ...initial,
      koelcel_1: numArr7(initial.koelcel_1),
      koelcel_2: numArr7(initial.koelcel_2),
      vriezer_1: numArr7(initial.vriezer_1),
      vriezer_2: numArr7(initial.vriezer_2),
      vriezer_ijs: numArr7(initial.vriezer_ijs),
      koelwerkbank_1: numArr7(initial.koelwerkbank_1),
      koelwerkbank_2: numArr7(initial.koelwerkbank_2),
      koelwerkbank_3: numArr7(initial.koelwerkbank_3),
      saladiere_1: numArr7(initial.saladiere_1),
      saladiere_2: numArr7(initial.saladiere_2),
      tht_fifo_ok: boolArr7(initial.tht_fifo_ok),
      afgedekt_ok: boolArr7(initial.afgedekt_ok),
      schoonmaak_ok: boolArr7(initial.schoonmaak_ok),
      week_number: weekNumber,
      year,
      store_id: storeId,
    };
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const violationCount = useMemo(() => {
    let n = 0;
    for (const eq of EQUIPMENT) {
      const arr = row[eq.key] as (number | null)[];
      for (const v of arr) {
        if (normViolation(eq.kind, v)) n++;
      }
    }
    return n;
  }, [row]);

  function setNumArray(
    key: keyof HaccpTemperaturenRow,
    day: number,
    val: string
  ) {
    const raw = val.trim() === "" ? null : Number(val.replace(",", "."));
    setRow((prev) => {
      const arr = [...(prev[key] as (number | null)[])];
      arr[day] = raw != null && Number.isFinite(raw) ? raw : null;
      return { ...prev, [key]: arr };
    });
  }

  function setBoolArray(key: keyof HaccpTemperaturenRow, day: number, val: boolean | null) {
    setRow((prev) => {
      const arr = [...(prev[key] as (boolean | null)[])];
      arr[day] = val;
      return { ...prev, [key]: arr };
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const payload = {
      store_id: storeId,
      week_number: weekNumber,
      year,
      koelcel_1: row.koelcel_1,
      koelcel_2: row.koelcel_2,
      vriezer_1: row.vriezer_1,
      vriezer_2: row.vriezer_2,
      vriezer_ijs: row.vriezer_ijs,
      koelwerkbank_1: row.koelwerkbank_1,
      koelwerkbank_2: row.koelwerkbank_2,
      koelwerkbank_3: row.koelwerkbank_3,
      saladiere_1: row.saladiere_1,
      saladiere_2: row.saladiere_2,
      vaatwasser_wastemperatuur: row.vaatwasser_wastemperatuur,
      vaatwasser_naspoeltemp: row.vaatwasser_naspoeltemp,
      opmerkingen: row.opmerkingen,
      paraaf: row.paraaf,
      tht_fifo_ok: row.tht_fifo_ok,
      afgedekt_ok: row.afgedekt_ok,
      schoonmaak_ok: row.schoonmaak_ok,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("haccp_temperaturen").upsert(payload, {
      onConflict: "store_id,week_number,year",
    });
    setSaving(false);
    if (error) setMessage(error.message);
    else setMessage("Opgeslagen.");
  }

  return (
    <div className="space-y-8">
      {violationCount > 0 && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <strong>{violationCount}</strong> meting(en) buiten norm (koeling &gt; 7 °C of vriezer warmer dan −18 °C).
        </p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Temperaturen (°C)</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/80">
                <th className="px-2 py-2 text-left font-medium text-zinc-700 dark:text-zinc-200">Ruimte</th>
                {WEEKDAY_LABELS_NL.map((d) => (
                  <th key={d} className="px-1 py-2 text-center font-medium text-zinc-600 dark:text-zinc-300">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EQUIPMENT.map((eq) => (
                <tr key={eq.key} className="border-b border-zinc-100 dark:border-zinc-700/80">
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium text-zinc-800 dark:text-zinc-100">
                    {eq.label}
                  </td>
                  {WEEKDAY_LABELS_NL.map((_, day) => {
                    const v = (row[eq.key] as (number | null)[])[day];
                    const bad = normViolation(eq.kind, v);
                    return (
                      <td key={day} className="p-0.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          className={`input w-full min-w-[3rem] tabular-nums ${
                            bad ? "border-red-500 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950/50 dark:text-red-100" : ""
                          }`}
                          value={v == null ? "" : String(v)}
                          onChange={(e) => setNumArray(eq.key, day, e.target.value)}
                          aria-invalid={bad}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Norm: koeling ≤ 7 °C; vriezer ≤ −18 °C. Rode cellen = buiten norm.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Vaatwasser (wekelijks)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Wastemperatuur (°C)</span>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              value={row.vaatwasser_wastemperatuur ?? ""}
              onChange={(e) => {
                const t = e.target.value.trim();
                setRow((r) => ({
                  ...r,
                  vaatwasser_wastemperatuur: t === "" ? null : Number(t.replace(",", ".")),
                }));
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Naspoeltemperatuur (°C)</span>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              value={row.vaatwasser_naspoeltemp ?? ""}
              onChange={(e) => {
                const t = e.target.value.trim();
                setRow((r) => ({
                  ...r,
                  vaatwasser_naspoeltemp: t === "" ? null : Number(t.replace(",", ".")),
                }));
              }}
            />
          </label>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Dagelijkse controles</h2>
        <p className="mb-2 text-xs text-zinc-500">Aanvinken: ja = voldaan, leeg = niet van toepassing / nog niet.</p>
        {(["tht_fifo_ok", "afgedekt_ok", "schoonmaak_ok"] as const).map((field) => (
          <div key={field} className="mb-4">
            <p className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {field === "tht_fifo_ok" && "THT / FIFO OK"}
              {field === "afgedekt_ok" && "Afgedekt OK"}
              {field === "schoonmaak_ok" && "Schoonmaak uitgevoerd"}
            </p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS_NL.map((label, day) => {
                const v = (row[field] as (boolean | null)[])[day];
                return (
                  <label
                    key={day}
                    className="flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-600"
                  >
                    <input
                      type="checkbox"
                      checked={v === true}
                      onChange={() => {
                        setBoolArray(field, day, v === true ? null : true);
                      }}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">Opmerkingen</span>
          <textarea
            className="input min-h-[88px]"
            value={row.opmerkingen ?? ""}
            onChange={(e) => setRow((r) => ({ ...r, opmerkingen: e.target.value || null }))}
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">Paraaf</span>
          <input
            className="input"
            value={row.paraaf ?? ""}
            onChange={(e) => setRow((r) => ({ ...r, paraaf: e.target.value || null }))}
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "Opslaan…" : "Opslaan"}
        </button>
        {message && <span className="text-sm text-zinc-600 dark:text-zinc-300">{message}</span>}
      </div>
    </div>
  );
}
