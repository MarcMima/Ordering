"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import {
  getHaccpStoreId,
  type HaccpStoreEquipmentRow,
  type HaccpTemperaturenRow,
  type HaccpWeeklyReading,
  isTemperatureWithinNorm,
} from "@/lib/haccp/types";
import { WEEKDAY_LABELS_EN } from "@/lib/haccp/week";

function parseReadings(raw: unknown): HaccpWeeklyReading[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object" && "equipment_id" in x) as HaccpWeeklyReading[];
}

function emptyReading(): Omit<HaccpWeeklyReading, "equipment_id"> {
  return {
    temperature: null,
    exact_temperature: null,
    fifo_ok: null,
    clean_ok: null,
    corrective_action: null,
    signature: null,
  };
}

function mergeReadings(
  equipment: HaccpStoreEquipmentRow[],
  existing: HaccpWeeklyReading[]
): HaccpWeeklyReading[] {
  const byId = new Map(existing.map((r) => [r.equipment_id, r]));
  return equipment.map((eq) => {
    const prev = byId.get(eq.id);
    const base = emptyReading();
    if (!prev) {
      return { equipment_id: eq.id, ...base };
    }
    return {
      equipment_id: eq.id,
      temperature: prev.temperature ?? null,
      exact_temperature: prev.exact_temperature ?? null,
      fifo_ok: prev.fifo_ok ?? null,
      clean_ok: prev.clean_ok ?? null,
      corrective_action: prev.corrective_action ?? null,
      signature: prev.signature ?? null,
    };
  });
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
  const { locations, locationId } = useLocation();
  const storeId = getHaccpStoreId(locations, locationId);

  const [equipment, setEquipment] = useState<HaccpStoreEquipmentRow[]>([]);
  const [equipmentErr, setEquipmentErr] = useState<string | null>(null);
  const [readings, setReadings] = useState<HaccpWeeklyReading[]>([]);
  const [weeklyCheckDow, setWeeklyCheckDow] = useState<number>(() => {
    const d = initial?.weekly_check_dow;
    if (typeof d === "number" && d >= 1 && d <= 7) return d;
    return 1;
  });
  const [opmerkingen, setOpmerkingen] = useState(initial?.opmerkingen ?? "");
  const [paraaf, setParaaf] = useState(initial?.paraaf ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data, error } = await supabase
        .from("haccp_store_equipment")
        .select("*")
        .eq("store_id", storeId)
        .order("sort_order", { ascending: true });
      if (error) {
        setEquipmentErr(error.message);
        setEquipment([]);
        return;
      }
      const list = (data ?? []) as HaccpStoreEquipmentRow[];
      setEquipment(list);
      setEquipmentErr(null);
      const existing = parseReadings(initial?.weekly_readings);
      setReadings(mergeReadings(list, existing));
    })();
  }, [storeId, weekNumber, year, initial]);

  const violationCount = useMemo(() => {
    let n = 0;
    for (const r of readings) {
      const eq = equipment.find((e) => e.id === r.equipment_id);
      if (!eq || r.temperature == null || !Number.isFinite(r.temperature)) continue;
      if (!isTemperatureWithinNorm(eq.norm_kind, eq.norm_value, r.temperature)) n++;
    }
    return n;
  }, [readings, equipment]);

  function patchReading(equipmentId: string, patch: Partial<HaccpWeeklyReading>) {
    setReadings((prev) =>
      prev.map((row) => (row.equipment_id === equipmentId ? { ...row, ...patch } : row))
    );
  }

  function parseNum(s: string): number | null {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const payload = {
      store_id: storeId,
      week_number: weekNumber,
      year,
      weekly_check_dow: weeklyCheckDow,
      weekly_readings: readings as unknown as Record<string, unknown>,
      opmerkingen: opmerkingen.trim() || null,
      paraaf: paraaf.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: selErr } = await supabase
      .from("haccp_temperaturen")
      .select("id")
      .eq("store_id", storeId)
      .eq("week_number", weekNumber)
      .eq("year", year)
      .maybeSingle();

    if (selErr) {
      setSaving(false);
      setMessage(selErr.message);
      return;
    }

    if (existing?.id) {
      const { error } = await supabase.from("haccp_temperaturen").update(payload).eq("id", existing.id);
      setSaving(false);
      if (error) setMessage(error.message);
      else setMessage("Saved.");
      return;
    }

    const { error } = await supabase.from("haccp_temperaturen").insert(payload);
    setSaving(false);
    if (error) setMessage(error.message);
    else setMessage("Saved.");
  }

  return (
    <div className="space-y-8">
      {equipmentErr && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Equipment list: {equipmentErr}. Apply migration 063 and ensure RLS allows access.
        </div>
      )}

      {violationCount > 0 && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <strong>{violationCount}</strong> reading(s) outside the required limit (see red cells).
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Weekly temperature check</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Record once per week. Pick the day of the check, then fill one row per appliance. Green = within limit;
          red = outside limit.
        </p>
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">Day of check</span>
          <select
            className="input w-full"
            value={weeklyCheckDow}
            onChange={(e) => setWeeklyCheckDow(Number(e.target.value))}
          >
            {WEEKDAY_LABELS_EN.map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Equipment</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/80">
                <th className="px-2 py-2 text-left font-medium text-zinc-700 dark:text-zinc-200">Fridge / unit</th>
                <th className="px-2 py-2 text-left font-medium text-zinc-700 dark:text-zinc-200">Norm</th>
                <th className="px-2 py-2 text-left font-medium text-zinc-700 dark:text-zinc-200">Temperature</th>
                <th className="px-2 py-2 text-left font-medium text-zinc-700 dark:text-zinc-200">Exact temperature</th>
                <th className="px-2 py-2 text-center font-medium text-zinc-700 dark:text-zinc-200">FIFO</th>
                <th className="px-2 py-2 text-center font-medium text-zinc-700 dark:text-zinc-200">Clean</th>
                <th className="px-2 py-2 text-left font-medium text-zinc-700 dark:text-zinc-200">Corrective action</th>
                <th className="px-2 py-2 text-left font-medium text-zinc-700 dark:text-zinc-200">Signature</th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((eq) => {
                const row = readings.find((r) => r.equipment_id === eq.id);
                if (!row) return null;
                const t = row.temperature;
                const hasTemp = t != null && Number.isFinite(t);
                const ok =
                  hasTemp && isTemperatureWithinNorm(eq.norm_kind, eq.norm_value, t as number);
                const bad = hasTemp && !ok;
                return (
                  <tr key={eq.id} className="border-b border-zinc-100 dark:border-zinc-700/80">
                    <td className="whitespace-nowrap px-2 py-2 font-medium text-zinc-800 dark:text-zinc-100">
                      {eq.label}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-zinc-600 dark:text-zinc-300">
                      {eq.norm_display}
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        className={`input w-full min-w-[4rem] tabular-nums ${
                          !hasTemp
                            ? ""
                            : ok
                              ? "border-emerald-500 bg-emerald-50 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-100"
                              : bad
                                ? "border-red-500 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950/50 dark:text-red-100"
                                : ""
                        }`}
                        value={row.temperature == null ? "" : String(row.temperature)}
                        onChange={(e) =>
                          patchReading(eq.id, { temperature: parseNum(e.target.value) })
                        }
                        aria-invalid={bad}
                      />
                    </td>
                    <td className="p-1">
                      {eq.show_exact_temp ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          className="input w-full min-w-[4rem] tabular-nums"
                          value={row.exact_temperature == null ? "" : String(row.exact_temperature)}
                          onChange={(e) =>
                            patchReading(eq.id, { exact_temperature: parseNum(e.target.value) })
                          }
                        />
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="p-1 text-center">
                      {eq.show_fifo ? (
                        <select
                          className="input inline-block w-[4.5rem] py-1 text-xs"
                          value={
                            row.fifo_ok === true ? "yes" : row.fifo_ok === false ? "no" : ""
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            patchReading(eq.id, {
                              fifo_ok: v === "" ? null : v === "yes",
                            });
                          }}
                        >
                          <option value="">—</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="p-1 text-center">
                      <select
                        className="input inline-block w-[4.5rem] py-1 text-xs"
                        value={row.clean_ok === true ? "yes" : row.clean_ok === false ? "no" : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          patchReading(eq.id, {
                            clean_ok: v === "" ? null : v === "yes",
                          });
                        }}
                      >
                        <option value="">—</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        className="input w-full min-w-[6rem] text-xs"
                        value={row.corrective_action ?? ""}
                        onChange={(e) =>
                          patchReading(eq.id, { corrective_action: e.target.value || null })
                        }
                        placeholder="If needed"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        className="input w-full min-w-[5rem] text-xs"
                        value={row.signature ?? ""}
                        onChange={(e) =>
                          patchReading(eq.id, { signature: e.target.value || null })
                        }
                        placeholder="Initials"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">Notes</span>
          <textarea
            className="input min-h-[88px]"
            value={opmerkingen}
            onChange={(e) => setOpmerkingen(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">
            Week sign-off (initials)
          </span>
          <input
            className="input"
            value={paraaf}
            onChange={(e) => setParaaf(e.target.value)}
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || equipment.length === 0}
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message && <span className="text-sm text-zinc-600 dark:text-zinc-300">{message}</span>}
      </div>
    </div>
  );
}
