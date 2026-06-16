"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import {
  getHaccpStoreId,
  type HaccpStoreEquipmentRow,
  type HaccpTemperaturenRow,
  type HaccpWeeklyReading,
} from "@/lib/haccp/types";
import {
  gteMinStatus,
  lteMaxStatus,
  temperatureInputClass,
  type TempFieldStatus,
} from "@/lib/haccp/temperatureFieldStyle";
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

function normStatus(
  kind: "lte" | "gte",
  norm: number,
  temp: number | null | undefined
): TempFieldStatus {
  return kind === "lte" ? lteMaxStatus(temp, norm) : gteMinStatus(temp, norm);
}

export function TemperaturenForm({
  weekNumber,
  year,
  initial,
  onSaved,
}: {
  weekNumber: number;
  year: number;
  initial: HaccpTemperaturenRow | null;
  /** Na geslaagde save: parent kan opnieuw fetchen zodat data zichtbaar blijft na week-wissel. */
  onSaved?: () => void;
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
      if (normStatus(eq.norm_kind, eq.norm_value, r.temperature) === "bad") n++;
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
      else {
        setMessage("Saved.");
        onSaved?.();
      }
      return;
    }

    const { error } = await supabase.from("haccp_temperaturen").insert(payload);
    setSaving(false);
    if (error) setMessage(error.message);
    else {
      setMessage("Saved.");
      onSaved?.();
    }
  }

  return (
    <div className="space-y-8">
      {equipmentErr && (
        <div className="alert-warning rounded-lg">
          Equipment list: {equipmentErr}. Apply migration 063 and ensure RLS allows access.
        </div>
      )}

      {violationCount > 0 && (
        <p className="alert-error rounded-lg">
          <strong>{violationCount}</strong> reading(s) outside the required limit (see red cells).
        </p>
      )}

      <section className="space-y-3">
        <h2 className="section-title">Weekly temperature check</h2>
        <p className="help-text">
          Record once per week. Pick the day of the check, then fill one row per appliance. Cooling: green below
          limit, amber at the limit (±0.1 °C band), red too warm. Hot holding: green from minimum up, amber slightly low,
          red too cold.
        </p>
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium text-ink">Day of check</span>
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
        <h2 className="mb-3 section-title">Equipment</h2>
        <div className="overflow-x-auto rounded-xl border border-brand-green/10">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-green/10 bg-background">
                <th className="px-2 py-2 text-left font-medium text-ink-soft">Fridge / unit</th>
                <th className="px-2 py-2 text-left font-medium text-ink-soft">Norm</th>
                <th className="px-2 py-2 text-left font-medium text-ink-soft">Temperature</th>
                <th className="px-2 py-2 text-left font-medium text-ink-soft">Exact temperature</th>
                <th className="px-2 py-2 text-center font-medium text-ink-soft">FIFO</th>
                <th className="px-2 py-2 text-center font-medium text-ink-soft">Clean</th>
                <th className="px-2 py-2 text-left font-medium text-ink-soft">Corrective action</th>
                <th className="px-2 py-2 text-left font-medium text-ink-soft">Signature</th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((eq) => {
                const row = readings.find((r) => r.equipment_id === eq.id);
                if (!row) return null;
                const t = row.temperature;
                const hasTemp = t != null && Number.isFinite(t);
                const st = hasTemp ? normStatus(eq.norm_kind, eq.norm_value, t as number) : "empty";
                const bad = st === "bad";
                const exactSt =
                  eq.show_exact_temp && row.exact_temperature != null && Number.isFinite(row.exact_temperature)
                    ? normStatus(eq.norm_kind, eq.norm_value, row.exact_temperature as number)
                    : "empty";
                return (
                  <tr key={eq.id} className="border-b border-brand-green/10">
                    <td className="whitespace-nowrap px-2 py-2 font-medium text-ink">
                      {eq.label}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-ink-soft">
                      {eq.norm_display}
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        className={temperatureInputClass(st, "min-w-[4rem]")}
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
                          className={temperatureInputClass(exactSt, "min-w-[4rem]")}
                          value={row.exact_temperature == null ? "" : String(row.exact_temperature)}
                          onChange={(e) =>
                            patchReading(eq.id, { exact_temperature: parseNum(e.target.value) })
                          }
                        />
                      ) : (
                        <span className="text-ink-soft/60">—</span>
                      )}
                    </td>
                    <td className="p-1 text-center">
                      {eq.show_fifo ? (
                        <select
                          className={`input inline-block w-[4.5rem] py-1 text-xs ${ row.fifo_ok === true ? "border-brand-green bg-brand-sage/25" : row.fifo_ok === false ? "border-accent-terracotta bg-brand-sand/40" : "" }`}
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
                        <span className="text-ink-soft/60">—</span>
                      )}
                    </td>
                    <td className="p-1 text-center">
                      <select
                        className={`input inline-block w-[4.5rem] py-1 text-xs ${ row.clean_ok === true ? "border-brand-green bg-brand-sage/25" : row.clean_ok === false ? "border-accent-terracotta bg-brand-sand/40" : "" }`}
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
          <span className="mb-1 block font-medium text-ink">Notes</span>
          <textarea
            className="input min-h-[88px]"
            value={opmerkingen}
            onChange={(e) => setOpmerkingen(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium text-ink">
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
          className="btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message && <span className="help-text">{message}</span>}
      </div>
    </div>
  );
}
