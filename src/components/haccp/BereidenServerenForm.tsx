"use client";

import { useState } from "react";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import type { HaccpBereidenMetingRow, HaccpBereidenRow } from "@/lib/haccp/types";
import { getHaccpStoreId } from "@/lib/haccp/types";

function emptyMeting(): HaccpBereidenMetingRow {
  return { datum: "", product: "", temp: null, maatregel: "", paraaf: "" };
}

function parseMetingen(raw: unknown, minRows: number): HaccpBereidenMetingRow[] {
  const arr = Array.isArray(raw) ? raw : [];
  const mapped: HaccpBereidenMetingRow[] = arr.map((x: Record<string, unknown>) => ({
    datum: typeof x?.datum === "string" ? x.datum : "",
    product: typeof x?.product === "string" ? x.product : "",
    temp: x?.temp != null && Number.isFinite(Number(x.temp)) ? Number(x.temp) : null,
    maatregel: typeof x?.maatregel === "string" ? x.maatregel : "",
    paraaf: typeof x?.paraaf === "string" ? x.paraaf : "",
  }));
  while (mapped.length < minRows) mapped.push(emptyMeting());
  return mapped;
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function defaultRow(storeId: number, week: number, year: number): HaccpBereidenRow {
  return {
    store_id: storeId,
    week_number: week,
    year,
    terugkoelen_nvt: false,
    terugkoelen_datum: null,
    terugkoelen_product: null,
    terugkoelen_tijd_begin: null,
    terugkoelen_temp_begin: null,
    terugkoelen_temp_2uur: null,
    terugkoelen_temp_5uur: null,
    terugkoelen_maatregel: null,
    terugkoelen_paraaf: null,
    kerntemp_gegaard_nvt: false,
    kerntemp_gegaard: [emptyMeting(), emptyMeting()],
    kerntemp_warmhoud_nvt: false,
    kerntemp_warmhoud: [emptyMeting(), emptyMeting()],
    serveertemp_nvt: false,
    serveertemp_warm: null,
    serveertemp_koud: null,
    serveertemp_paraaf: null,
    frituur_nvt: false,
    frituur_metingen: [
      { ...emptyMeting(), product: "Fryer 1" },
      { ...emptyMeting(), product: "Fryer 2" },
    ],
    regenereer_nvt: false,
    regenereer_metingen: [emptyMeting(), emptyMeting()],
    regenereer_tijd_minuten: null,
    buffet_warm_nvt: false,
    buffet_warm: [emptyMeting(), emptyMeting()],
    buffet_koud_nvt: false,
    buffet_koud: [emptyMeting(), emptyMeting()],
  };
}

function mergeInitial(
  initial: HaccpBereidenRow | null,
  week: number,
  year: number,
  storeId: number
): HaccpBereidenRow {
  const base = defaultRow(storeId, week, year);
  if (!initial) return base;
  return {
    ...base,
    ...initial,
    terugkoelen_nvt: Boolean(initial.terugkoelen_nvt),
    kerntemp_gegaard_nvt: Boolean(initial.kerntemp_gegaard_nvt),
    kerntemp_warmhoud_nvt: Boolean(initial.kerntemp_warmhoud_nvt),
    serveertemp_nvt: Boolean(initial.serveertemp_nvt),
    frituur_nvt: Boolean(initial.frituur_nvt),
    regenereer_nvt: Boolean(initial.regenereer_nvt),
    buffet_warm_nvt: Boolean(initial.buffet_warm_nvt),
    buffet_koud_nvt: Boolean(initial.buffet_koud_nvt),
    kerntemp_gegaard: parseMetingen(initial.kerntemp_gegaard, 2),
    kerntemp_warmhoud: parseMetingen(initial.kerntemp_warmhoud, 2),
    frituur_metingen: (() => {
      const p = parseMetingen(initial.frituur_metingen, 2);
      if (!p[0]?.product?.trim()) p[0] = { ...p[0], product: "Fryer 1" };
      if (!p[1]?.product?.trim()) p[1] = { ...p[1], product: "Fryer 2" };
      return p;
    })(),
    regenereer_metingen: parseMetingen(initial.regenereer_metingen, 2),
    buffet_warm: parseMetingen(initial.buffet_warm, 2),
    buffet_koud: parseMetingen(initial.buffet_koud, 2),
    week_number: week,
    year,
    store_id: storeId,
  };
}

type Props = {
  weekNumber: number;
  year: number;
  initial: HaccpBereidenRow | null;
};

export function BereidenServerenForm({ weekNumber, year, initial }: Props) {
  const { locations, locationId } = useLocation();
  const storeId = getHaccpStoreId(locations, locationId);
  const [row, setRow] = useState<HaccpBereidenRow>(() =>
    mergeInitial(initial, weekNumber, year, storeId)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function setMetingen(
    key: "kerntemp_gegaard" | "kerntemp_warmhoud" | "frituur_metingen" | "regenereer_metingen" | "buffet_warm" | "buffet_koud",
    rows: HaccpBereidenMetingRow[]
  ) {
    setRow((r) => ({ ...r, [key]: rows }));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const payload = {
      store_id: storeId,
      week_number: weekNumber,
      year,
      terugkoelen_nvt: row.terugkoelen_nvt,
      terugkoelen_datum: row.terugkoelen_datum || null,
      terugkoelen_product: row.terugkoelen_product || null,
      terugkoelen_tijd_begin: row.terugkoelen_tijd_begin || null,
      terugkoelen_temp_begin: row.terugkoelen_temp_begin,
      terugkoelen_temp_2uur: row.terugkoelen_temp_2uur,
      terugkoelen_temp_5uur: row.terugkoelen_temp_5uur,
      terugkoelen_maatregel: row.terugkoelen_maatregel || null,
      terugkoelen_paraaf: row.terugkoelen_paraaf || null,
      kerntemp_gegaard_nvt: row.kerntemp_gegaard_nvt,
      kerntemp_gegaard: row.kerntemp_gegaard,
      kerntemp_warmhoud_nvt: row.kerntemp_warmhoud_nvt,
      kerntemp_warmhoud: row.kerntemp_warmhoud,
      serveertemp_nvt: row.serveertemp_nvt,
      serveertemp_warm: row.serveertemp_warm,
      serveertemp_koud: row.serveertemp_koud,
      serveertemp_paraaf: row.serveertemp_paraaf || null,
      frituur_nvt: row.frituur_nvt,
      frituur_metingen: row.frituur_metingen,
      regenereer_nvt: row.regenereer_nvt,
      regenereer_metingen: row.regenereer_metingen,
      regenereer_tijd_minuten: row.regenereer_tijd_minuten,
      buffet_warm_nvt: row.buffet_warm_nvt,
      buffet_warm: row.buffet_warm,
      buffet_koud_nvt: row.buffet_koud_nvt,
      buffet_koud: row.buffet_koud,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from("haccp_bereiden")
      .select("id")
      .eq("store_id", storeId)
      .eq("week_number", weekNumber)
      .eq("year", year)
      .maybeSingle();

    const err = existing?.id
      ? (await supabase.from("haccp_bereiden").update(payload).eq("id", existing.id)).error
      : (await supabase.from("haccp_bereiden").insert(payload)).error;

    setSaving(false);
    if (err) setMessage(err.message);
    else setMessage("Saved.");
  }

  const g = row.kerntemp_gegaard as HaccpBereidenMetingRow[];
  const w = row.kerntemp_warmhoud as HaccpBereidenMetingRow[];
  const f = row.frituur_metingen as HaccpBereidenMetingRow[];
  const rg = row.regenereer_metingen as HaccpBereidenMetingRow[];
  const bw = row.buffet_warm as HaccpBereidenMetingRow[];
  const bk = row.buffet_koud as HaccpBereidenMetingRow[];

  return (
    <div className="space-y-10">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Based on the paper form &ldquo;Registratie bereiden / serveren&rdquo;. Frequencies on the PDF (e.g. weekly)
        are shown as hints; norms follow the sheet (warm ≥ 60 °C, cold ≤ 7 °C, etc.).
      </p>

      {/* Terugkoelen */}
      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Cooling (terugkoelen)</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={row.terugkoelen_nvt}
              onChange={(e) => setRow((r) => ({ ...r, terugkoelen_nvt: e.target.checked }))}
            />
            Not applicable
          </label>
        </div>
        {!row.terugkoelen_nvt && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Product</span>
                <input
                  className="input w-full"
                  value={row.terugkoelen_product ?? ""}
                  onChange={(e) => setRow((r) => ({ ...r, terugkoelen_product: e.target.value || null }))}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Date</span>
                <input
                  type="date"
                  className="input w-full"
                  value={row.terugkoelen_datum?.slice(0, 10) ?? ""}
                  onChange={(e) =>
                    setRow((r) => ({ ...r, terugkoelen_datum: e.target.value || null }))
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Time (start)</span>
                <input
                  className="input w-full"
                  placeholder="e.g. 14:30"
                  value={row.terugkoelen_tijd_begin ?? ""}
                  onChange={(e) =>
                    setRow((r) => ({ ...r, terugkoelen_tijd_begin: e.target.value || null }))
                  }
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Start temp (°C)</span>
                <span className="mb-1 block text-xs text-zinc-500">Norm ≥ 75 °C</span>
                <input
                  className="input w-full tabular-nums"
                  inputMode="decimal"
                  value={row.terugkoelen_temp_begin ?? ""}
                  onChange={(e) =>
                    setRow((r) => ({ ...r, terugkoelen_temp_begin: parseNum(e.target.value) }))
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">After 2 h (°C)</span>
                <span className="mb-1 block text-xs text-zinc-500">Target ≤ 20 °C</span>
                <input
                  className="input w-full tabular-nums"
                  inputMode="decimal"
                  value={row.terugkoelen_temp_2uur ?? ""}
                  onChange={(e) =>
                    setRow((r) => ({ ...r, terugkoelen_temp_2uur: parseNum(e.target.value) }))
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">After 5 h (°C)</span>
                <span className="mb-1 block text-xs text-zinc-500">Target ≤ 7 °C</span>
                <input
                  className="input w-full tabular-nums"
                  inputMode="decimal"
                  value={row.terugkoelen_temp_5uur ?? ""}
                  onChange={(e) =>
                    setRow((r) => ({ ...r, terugkoelen_temp_5uur: parseNum(e.target.value) }))
                  }
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Corrective action</span>
              <textarea
                className="input min-h-[64px]"
                value={row.terugkoelen_maatregel ?? ""}
                onChange={(e) =>
                  setRow((r) => ({ ...r, terugkoelen_maatregel: e.target.value || null }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Initials</span>
              <input
                className="input max-w-xs"
                value={row.terugkoelen_paraaf ?? ""}
                onChange={(e) =>
                  setRow((r) => ({ ...r, terugkoelen_paraaf: e.target.value || null }))
                }
              />
            </label>
            <p className="text-xs text-zinc-500">Frequency (paper): 1× per week</p>
          </div>
        )}
      </section>

      {/* Kerntemp gegaard */}
      <MetingenSection
        title="Core temperature — cooked component"
        norm="≥ 75 °C"
        frequency="1× per week"
        nvt={row.kerntemp_gegaard_nvt}
        onNvt={(v) => setRow((r) => ({ ...r, kerntemp_gegaard_nvt: v }))}
        rows={g}
        onRowsChange={(rows) => setMetingen("kerntemp_gegaard", rows)}
      />

      {/* Warmhoud */}
      <MetingenSection
        title="Core temperature — hot holding"
        norm="≥ 60 °C"
        frequency="1× per week"
        nvt={row.kerntemp_warmhoud_nvt}
        onNvt={(v) => setRow((r) => ({ ...r, kerntemp_warmhoud_nvt: v }))}
        rows={w}
        onRowsChange={(rows) => setMetingen("kerntemp_warmhoud", rows)}
      />

      {/* Serveertemp */}
      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Serving temperature (warm / cold)</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={row.serveertemp_nvt}
              onChange={(e) => setRow((r) => ({ ...r, serveertemp_nvt: e.target.checked }))}
            />
            Not applicable
          </label>
        </div>
        {!row.serveertemp_nvt && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Warm (°C)</span>
              <span className="mb-1 block text-xs text-zinc-500">≥ 60 °C</span>
              <input
                className="input tabular-nums"
                inputMode="decimal"
                value={row.serveertemp_warm ?? ""}
                onChange={(e) =>
                  setRow((r) => ({ ...r, serveertemp_warm: parseNum(e.target.value) }))
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Cold (°C)</span>
              <span className="mb-1 block text-xs text-zinc-500">≤ 7 °C</span>
              <input
                className="input tabular-nums"
                inputMode="decimal"
                value={row.serveertemp_koud ?? ""}
                onChange={(e) =>
                  setRow((r) => ({ ...r, serveertemp_koud: parseNum(e.target.value) }))
                }
              />
            </label>
            <label className="sm:col-span-2 text-sm">
              <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Initials</span>
              <input
                className="input max-w-xs"
                value={row.serveertemp_paraaf ?? ""}
                onChange={(e) =>
                  setRow((r) => ({ ...r, serveertemp_paraaf: e.target.value || null }))
                }
              />
            </label>
            <p className="sm:col-span-2 text-xs text-zinc-500">Frequency (paper): 1× per week</p>
          </div>
        )}
      </section>

      {/* Frituur */}
      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Deep fryer</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={row.frituur_nvt}
              onChange={(e) => setRow((r) => ({ ...r, frituur_nvt: e.target.checked }))}
            />
            Not applicable
          </label>
        </div>
        {!row.frituur_nvt && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left dark:border-zinc-600">
                  <th className="py-2 pr-2">Unit</th>
                  <th className="py-2 pr-2">Temp (°C)</th>
                  <th className="py-2 pr-2">Norm</th>
                  <th className="py-2 pr-2">Corrective action</th>
                  <th className="py-2">Initials</th>
                </tr>
              </thead>
              <tbody>
                {f.map((line, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-700/80">
                    <td className="py-1.5 pr-2">
                      <input
                        className="input py-1 text-sm"
                        value={line.product ?? ""}
                        onChange={(e) => {
                          const next = [...f];
                          next[i] = { ...next[i], product: e.target.value };
                          setMetingen("frituur_metingen", next);
                        }}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        className="input py-1 tabular-nums"
                        inputMode="decimal"
                        value={line.temp ?? ""}
                        onChange={(e) => {
                          const next = [...f];
                          next[i] = { ...next[i], temp: parseNum(e.target.value) };
                          setMetingen("frituur_metingen", next);
                        }}
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-xs text-zinc-500">≤ 175 °C</td>
                    <td className="py-1.5 pr-2">
                      <input
                        className="input py-1 text-sm"
                        value={line.maatregel ?? ""}
                        onChange={(e) => {
                          const next = [...f];
                          next[i] = { ...next[i], maatregel: e.target.value };
                          setMetingen("frituur_metingen", next);
                        }}
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        className="input py-1 text-sm"
                        value={line.paraaf ?? ""}
                        onChange={(e) => {
                          const next = [...f];
                          next[i] = { ...next[i], paraaf: e.target.value };
                          setMetingen("frituur_metingen", next);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-zinc-500">Frequency (paper): 1× per week per fryer</p>
          </div>
        )}
      </section>

      {/* Regenereren */}
      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Regenerated component</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={row.regenereer_nvt}
              onChange={(e) => setRow((r) => ({ ...r, regenereer_nvt: e.target.checked }))}
            />
            Not applicable
          </label>
        </div>
        {!row.regenereer_nvt && (
          <>
            <MetingenTable
              rows={rg}
              onChange={(rows) => setMetingen("regenereer_metingen", rows)}
              norm="≥ 60 °C"
            />
            <label className="block max-w-xs text-sm">
              <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Regeneration time (minutes)</span>
              <span className="mb-1 block text-xs text-zinc-500">Norm: within &lt; 60 minutes</span>
              <input
                className="input tabular-nums"
                inputMode="decimal"
                value={row.regenereer_tijd_minuten ?? ""}
                onChange={(e) =>
                  setRow((r) => ({ ...r, regenereer_tijd_minuten: parseNum(e.target.value) }))
                }
              />
            </label>
            <p className="text-xs text-zinc-500">Frequency (paper): 1× per week</p>
          </>
        )}
      </section>

      {/* Buffet warm */}
      <MetingenSection
        title="Hot buffet — core temperature"
        norm="≥ 60 °C"
        frequency="2 measurements per week (paper)"
        nvt={row.buffet_warm_nvt}
        onNvt={(v) => setRow((r) => ({ ...r, buffet_warm_nvt: v }))}
        rows={bw}
        onRowsChange={(rows) => setMetingen("buffet_warm", rows)}
      />

      {/* Buffet koud */}
      <MetingenSection
        title="Cold buffet (outside 2h safeguard)"
        norm="≤ 7 °C"
        frequency="2 measurements per week (paper)"
        nvt={row.buffet_koud_nvt}
        onNvt={(v) => setRow((r) => ({ ...r, buffet_koud_nvt: v }))}
        rows={bk}
        onRowsChange={(rows) => setMetingen("buffet_koud", rows)}
      />

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

function MetingenSection({
  title,
  norm,
  frequency,
  nvt,
  onNvt,
  rows,
  onRowsChange,
}: {
  title: string;
  norm: string;
  frequency: string;
  nvt: boolean;
  onNvt: (v: boolean) => void;
  rows: HaccpBereidenMetingRow[];
  onRowsChange: (rows: HaccpBereidenMetingRow[]) => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={nvt} onChange={(e) => onNvt(e.target.checked)} />
          Not applicable
        </label>
      </div>
      {!nvt && (
        <>
          <MetingenTable rows={rows} onChange={onRowsChange} norm={norm} />
          <p className="text-xs text-zinc-500">{frequency}</p>
        </>
      )}
    </section>
  );
}

function MetingenTable({
  rows,
  onChange,
  norm,
}: {
  rows: HaccpBereidenMetingRow[];
  onChange: (rows: HaccpBereidenMetingRow[]) => void;
  norm: string;
}) {
  function patch(i: number, patch: Partial<HaccpBereidenMetingRow>) {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left dark:border-zinc-600">
            <th className="py-2 pr-2">Date</th>
            <th className="py-2 pr-2">Product</th>
            <th className="py-2 pr-2">Temp (°C)</th>
            <th className="py-2 pr-2">Norm</th>
            <th className="py-2 pr-2">Corrective action</th>
            <th className="py-2">Initials</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line, i) => (
            <tr key={i} className="border-b border-zinc-100 dark:border-zinc-700/80">
              <td className="py-1.5 pr-2">
                <input
                  type="date"
                  className="input py-1 text-sm"
                  value={line.datum?.slice(0, 10) ?? ""}
                  onChange={(e) => patch(i, { datum: e.target.value })}
                />
              </td>
              <td className="py-1.5 pr-2">
                <input
                  className="input py-1 text-sm"
                  value={line.product ?? ""}
                  onChange={(e) => patch(i, { product: e.target.value })}
                />
              </td>
              <td className="py-1.5 pr-2">
                <input
                  className="input py-1 tabular-nums"
                  inputMode="decimal"
                  value={line.temp ?? ""}
                  onChange={(e) => patch(i, { temp: parseNum(e.target.value) })}
                />
              </td>
              <td className="py-1.5 pr-2 text-xs text-zinc-500">{norm}</td>
              <td className="py-1.5 pr-2">
                <input
                  className="input py-1 text-sm"
                  value={line.maatregel ?? ""}
                  onChange={(e) => patch(i, { maatregel: e.target.value })}
                />
              </td>
              <td className="py-1.5">
                <input
                  className="input py-1 text-sm"
                  value={line.paraaf ?? ""}
                  onChange={(e) => patch(i, { paraaf: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
