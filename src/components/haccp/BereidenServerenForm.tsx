"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import type { HaccpBereidenMetingRow, HaccpBereidenRow } from "@/lib/haccp/types";
import { getHaccpStoreId } from "@/lib/haccp/types";
import {
  gteMinStatus,
  lteMaxStatus,
  temperatureInputClass,
  type TempFieldStatus,
} from "@/lib/haccp/temperatureFieldStyle";

const COOKED_OPTIONS = [
  "Grilled chicken",
  "Falafel",
  "Aubergine",
  "Cauliflower",
  "Soup",
] as const;

const REHEATED_OPTIONS = ["Grilled chicken", "Mujadara", "Turmeric rice", "Soup"] as const;

const WARM_SERVE_OPTIONS = [
  "Grilled chicken",
  "Falafel",
  "Soup",
  "Rice",
  "Aubergine",
  "Cauliflower",
] as const;

const COLD_SERVE_OPTIONS = [
  "Hummus",
  "Medi salad",
  "Pickled onion",
  "Pickled cabbage",
  "Tzatziki",
  "Feta",
  "Eggs",
  "Pomegranate seeds",
  "Pickles",
  "Peppers",
  "Olives",
] as const;

const COLD_LINE_HINT =
  "Cold line products: hummus, medi salad, pickled onion, pickled cabbage, tzatziki, feta, eggs, pomegranate seeds, pickles, peppers, olives.";

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

function jsonHasData(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  return raw.some((r: HaccpBereidenMetingRow) => {
    if (!r || typeof r !== "object") return false;
    if (r.temp != null && Number.isFinite(Number(r.temp))) return true;
    if (r.paraaf?.trim()) return true;
    if (r.product?.trim()) return true;
    if (r.datum?.trim()) return true;
    return false;
  });
}

function defaultRow(storeId: number, week: number, year: number): HaccpBereidenRow {
  return {
    store_id: storeId,
    week_number: week,
    year,
    terugkoelen_nvt: false,
    terugkoelen_datum: null,
    terugkoelen_product: "Hummus",
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
    serveertemp_warm_product: null,
    serveertemp_koud_product: null,
    serveertemp_paraaf: null,
    frituur_nvt: true,
    frituur_metingen: [],
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
    terugkoelen_nvt: false,
    terugkoelen_product: (initial.terugkoelen_product?.trim() || "Hummus") as string,
    kerntemp_gegaard_nvt: false,
    kerntemp_warmhoud_nvt: false,
    serveertemp_nvt: false,
    frituur_nvt: true,
    frituur_metingen: [],
    regenereer_nvt: false,
    buffet_warm_nvt: false,
    buffet_koud_nvt: false,
    kerntemp_gegaard: parseMetingen(initial.kerntemp_gegaard, 2),
    kerntemp_warmhoud: parseMetingen(initial.kerntemp_warmhoud, 2),
    regenereer_metingen: parseMetingen(initial.regenereer_metingen, 2),
    buffet_warm: parseMetingen(initial.buffet_warm, 2),
    buffet_koud: parseMetingen(initial.buffet_koud, 2),
    serveertemp_warm_product: initial.serveertemp_warm_product ?? null,
    serveertemp_koud_product: initial.serveertemp_koud_product ?? null,
    week_number: week,
    year,
    store_id: storeId,
  };
}

type Props = {
  weekNumber: number;
  year: number;
  initial: HaccpBereidenRow | null;
  onSaved?: () => void;
};

/** Haal grenswaarde uit normtekst zoals "≥ 75 °C" of "≤ 7 °C". */
function parseNormLimits(norm: string): { lte?: number; gte?: number } {
  const n = norm.replace(/\u00a0/g, " ").trim();
  const lteU = n.match(/≤\s*([\d.,]+)|<=\s*([\d.,]+)/);
  if (lteU) {
    const v = lteU[1] || lteU[2];
    return { lte: Number(String(v).replace(",", ".")) };
  }
  const gteU = n.match(/≥\s*([\d.,]+)|>=\s*([\d.,]+)/);
  if (gteU) {
    const v = gteU[1] || gteU[2];
    return { gte: Number(String(v).replace(",", ".")) };
  }
  return {};
}

function tempStatusFromNorm(
  temp: number | null | undefined,
  limits: { lte?: number; gte?: number }
): TempFieldStatus {
  if (temp == null || !Number.isFinite(temp)) return "empty";
  if (limits.lte != null) return lteMaxStatus(temp, limits.lte);
  if (limits.gte != null) return gteMinStatus(temp, limits.gte);
  return "empty";
}

export function BereidenServerenForm({ weekNumber, year, initial, onSaved }: Props) {
  const { locations, locationId } = useLocation();
  const storeId = getHaccpStoreId(locations, locationId);
  const [row, setRow] = useState<HaccpBereidenRow>(() =>
    mergeInitial(initial, weekNumber, year, storeId)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setRow(mergeInitial(initial, weekNumber, year, storeId));
  }, [initial, weekNumber, year, storeId]);

  function setMetingen(
    key:
      | "kerntemp_gegaard"
      | "kerntemp_warmhoud"
      | "regenereer_metingen"
      | "buffet_warm"
      | "buffet_koud",
    rows: HaccpBereidenMetingRow[]
  ) {
    setRow((r) => ({ ...r, [key]: rows }));
  }

  const completion = useMemo(() => {
    const cooling =
      !!row.terugkoelen_datum?.trim() ||
      row.terugkoelen_temp_begin != null ||
      row.terugkoelen_temp_2uur != null ||
      row.terugkoelen_temp_5uur != null ||
      !!(row.terugkoelen_tijd_begin?.trim() ||
        row.terugkoelen_maatregel?.trim() ||
        row.terugkoelen_paraaf?.trim());
    return {
      cooling,
      cooked: jsonHasData(row.kerntemp_gegaard),
      warmhold: jsonHasData(row.kerntemp_warmhoud),
      serve:
        row.serveertemp_warm != null ||
        row.serveertemp_koud != null ||
        !!(row.serveertemp_paraaf?.trim() || row.serveertemp_warm_product || row.serveertemp_koud_product),
      reheated: jsonHasData(row.regenereer_metingen) || row.regenereer_tijd_minuten != null,
      hotline: jsonHasData(row.buffet_warm),
      coldline: jsonHasData(row.buffet_koud),
    };
  }, [row]);

  async function save() {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const payload = {
      store_id: storeId,
      week_number: weekNumber,
      year,
      terugkoelen_nvt: false,
      terugkoelen_datum: row.terugkoelen_datum || null,
      terugkoelen_product: "Hummus",
      terugkoelen_tijd_begin: row.terugkoelen_tijd_begin || null,
      terugkoelen_temp_begin: row.terugkoelen_temp_begin,
      terugkoelen_temp_2uur: row.terugkoelen_temp_2uur,
      terugkoelen_temp_5uur: row.terugkoelen_temp_5uur,
      terugkoelen_maatregel: row.terugkoelen_maatregel || null,
      terugkoelen_paraaf: row.terugkoelen_paraaf || null,
      kerntemp_gegaard_nvt: false,
      kerntemp_gegaard: row.kerntemp_gegaard,
      kerntemp_warmhoud_nvt: false,
      kerntemp_warmhoud: row.kerntemp_warmhoud,
      serveertemp_nvt: false,
      serveertemp_warm: row.serveertemp_warm,
      serveertemp_koud: row.serveertemp_koud,
      serveertemp_warm_product: row.serveertemp_warm_product || null,
      serveertemp_koud_product: row.serveertemp_koud_product || null,
      serveertemp_paraaf: row.serveertemp_paraaf || null,
      frituur_nvt: true,
      frituur_metingen: [],
      regenereer_nvt: false,
      regenereer_metingen: row.regenereer_metingen,
      regenereer_tijd_minuten: row.regenereer_tijd_minuten,
      buffet_warm_nvt: false,
      buffet_warm: row.buffet_warm,
      buffet_koud_nvt: false,
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
    else {
      setMessage("Saved.");
      onSaved?.();
    }
  }

  const g = row.kerntemp_gegaard as HaccpBereidenMetingRow[];
  const w = row.kerntemp_warmhoud as HaccpBereidenMetingRow[];
  const rg = row.regenereer_metingen as HaccpBereidenMetingRow[];
  const bw = row.buffet_warm as HaccpBereidenMetingRow[];
  const bk = row.buffet_koud as HaccpBereidenMetingRow[];

  const blocks = useMemo(() => {
    type Block = { key: string; complete: boolean; node: ReactNode };
    const out: Block[] = [
      {
        key: "cooling",
        complete: completion.cooling,
        node: (
          <SectionShell key="cooling" title="Cooling" complete={completion.cooling}>
            <div className="space-y-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Product: <span className="font-medium text-zinc-900 dark:text-zinc-100">Hummus</span> (fixed).
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
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
                    className={temperatureInputClass(
                      gteMinStatus(row.terugkoelen_temp_begin, 75),
                      "w-full tabular-nums"
                    )}
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
                    className={temperatureInputClass(
                      lteMaxStatus(row.terugkoelen_temp_2uur, 20),
                      "w-full tabular-nums"
                    )}
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
                    className={temperatureInputClass(
                      lteMaxStatus(row.terugkoelen_temp_5uur, 7),
                      "w-full tabular-nums"
                    )}
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
          </SectionShell>
        ),
      },
      {
        key: "cooked",
        complete: completion.cooked,
        node: (
          <MetingenBlock
            key="cooked"
            title="Core temperature — cooked component"
            subtitle="Directly after preparation e.g. straight from fryer or oven"
            norm="≥ 75 °C"
            frequency="1× per week"
            complete={completion.cooked}
            rows={g}
            onRowsChange={(rows) => setMetingen("kerntemp_gegaard", rows)}
            productOptions={COOKED_OPTIONS}
          />
        ),
      },
      {
        key: "warmhold",
        complete: completion.warmhold,
        node: (
          <MetingenBlock
            key="warmhold"
            title="Core temperature — hot holding"
            subtitle="From the hot box / Alto Shaam"
            norm="≥ 60 °C"
            frequency="1× per week"
            complete={completion.warmhold}
            rows={w}
            onRowsChange={(rows) => setMetingen("kerntemp_warmhoud", rows)}
          />
        ),
      },
      {
        key: "serve",
        complete: completion.serve,
        node: (
          <SectionShell key="serve" title="Serving temperature (warm / cold)" complete={completion.serve}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Warm product</span>
                <select
                  className="input w-full"
                  value={row.serveertemp_warm_product ?? ""}
                  onChange={(e) =>
                    setRow((r) => ({
                      ...r,
                      serveertemp_warm_product: e.target.value || null,
                    }))
                  }
                >
                  <option value="">—</option>
                  {WARM_SERVE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Cold product</span>
                <select
                  className="input w-full"
                  value={row.serveertemp_koud_product ?? ""}
                  onChange={(e) =>
                    setRow((r) => ({
                      ...r,
                      serveertemp_koud_product: e.target.value || null,
                    }))
                  }
                >
                  <option value="">—</option>
                  {COLD_SERVE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Warm (°C)</span>
                <span className="mb-1 block text-xs text-zinc-500">≥ 60 °C</span>
                <input
                  className={temperatureInputClass(gteMinStatus(row.serveertemp_warm, 60), "tabular-nums")}
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
                  className={temperatureInputClass(lteMaxStatus(row.serveertemp_koud, 7), "tabular-nums")}
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
          </SectionShell>
        ),
      },
      {
        key: "reheated",
        complete: completion.reheated,
        node: (
          <SectionShell key="reheated" title="Reheated" complete={completion.reheated}>
            <div className="space-y-3">
              <MetingenTable
                rows={rg}
                onChange={(rows) => setMetingen("regenereer_metingen", rows)}
                norm="≥ 60 °C"
                productOptions={REHEATED_OPTIONS}
              />
              <label className="block max-w-xs text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Reheat time (minutes)</span>
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
            </div>
          </SectionShell>
        ),
      },
      {
        key: "hotline",
        complete: completion.hotline,
        node: (
          <MetingenBlock
            key="hotline"
            title="Hot line — core temperature"
            norm="≥ 60 °C"
            frequency="2 measurements per week (paper)"
            complete={completion.hotline}
            rows={bw}
            onRowsChange={(rows) => setMetingen("buffet_warm", rows)}
          />
        ),
      },
      {
        key: "coldline",
        complete: completion.coldline,
        node: (
          <MetingenBlock
            key="coldline"
            title="Cold line — core temperature"
            norm="≤ 7 °C"
            frequency="2 measurements per week (paper)"
            complete={completion.coldline}
            rows={bk}
            onRowsChange={(rows) => setMetingen("buffet_koud", rows)}
            footerNote={COLD_LINE_HINT}
          />
        ),
      },
    ];
    out.sort((a, b) => Number(a.complete) - Number(b.complete));
    return out;
  }, [row, completion]);

  return (
    <div className="space-y-10">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Based on the paper form &ldquo;Registratie bereiden / serveren&rdquo;. Fryer checks are recorded under
        weekly equipment temperatures. Norms: warm ≥ 60 °C, cold ≤ 7 °C where stated.
      </p>

      {blocks.map((b) => (
        <div key={b.key}>{b.node}</div>
      ))}

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

function SectionShell({
  title,
  complete,
  children,
}: {
  title: string;
  complete: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(!complete);

  useEffect(() => {
    if (complete) setExpanded(false);
  }, [complete]);

  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
        {complete && (
          <button
            type="button"
            className="shrink-0 text-sm font-medium text-zinc-600 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "Minimize" : "Expand"}
          </button>
        )}
      </div>
      <div
        className={
          complete && !expanded
            ? "relative max-h-32 overflow-hidden pb-6 transition-[max-height] duration-200"
            : ""
        }
      >
        {children}
        {complete && !expanded && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white to-transparent dark:from-zinc-800/95 dark:to-transparent"
            aria-hidden
          />
        )}
      </div>
    </section>
  );
}

function MetingenBlock({
  title,
  subtitle,
  norm,
  frequency,
  complete,
  rows,
  onRowsChange,
  productOptions,
  footerNote,
}: {
  title: string;
  subtitle?: string;
  norm: string;
  frequency: string;
  complete: boolean;
  rows: HaccpBereidenMetingRow[];
  onRowsChange: (rows: HaccpBereidenMetingRow[]) => void;
  productOptions?: readonly string[];
  footerNote?: string;
}) {
  return (
    <SectionShell complete={complete} title={title}>
      <div className="space-y-3">
        {subtitle && <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>}
        <MetingenTable rows={rows} onChange={onRowsChange} norm={norm} productOptions={productOptions} />
        <p className="text-xs text-zinc-500">{frequency}</p>
        {footerNote && <p className="text-xs text-zinc-500">{footerNote}</p>}
      </div>
    </SectionShell>
  );
}

function MetingenTable({
  rows,
  onChange,
  norm,
  productOptions,
}: {
  rows: HaccpBereidenMetingRow[];
  onChange: (rows: HaccpBereidenMetingRow[]) => void;
  norm: string;
  productOptions?: readonly string[];
}) {
  const limits = parseNormLimits(norm);

  function patch(i: number, patchRow: Partial<HaccpBereidenMetingRow>) {
    const next = [...rows];
    next[i] = { ...next[i], ...patchRow };
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
                {productOptions ? (
                  <select
                    className="input py-1 text-sm"
                    value={line.product ?? ""}
                    onChange={(e) => patch(i, { product: e.target.value })}
                  >
                    <option value="">—</option>
                    {productOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input py-1 text-sm"
                    value={line.product ?? ""}
                    onChange={(e) => patch(i, { product: e.target.value })}
                  />
                )}
              </td>
              <td className="py-1.5 pr-2">
                <input
                  className={temperatureInputClass(
                    tempStatusFromNorm(line.temp, limits),
                    "py-1 tabular-nums"
                  )}
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
