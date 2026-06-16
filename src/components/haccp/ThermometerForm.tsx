"use client";

import { useMemo, useState } from "react";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import { getHaccpStoreId } from "@/lib/haccp/types";
import { gteMinStatus, lteMaxStatus, temperatureInputClass } from "@/lib/haccp/temperatureFieldStyle";

function calcAfwijking(kokend: number, smeltend: number): number {
  return Math.max(Math.abs(kokend - 100), Math.abs(smeltend - 0));
}

export function ThermometerForm() {
  const { locations, locationId } = useLocation();
  const storeId = getHaccpStoreId(locations, locationId);
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [tempKokend, setTempKokend] = useState("");
  const [tempSmeltend, setTempSmeltend] = useState("");
  const [maatregel, setMaatregel] = useState("");
  const [paraaf, setParaaf] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const kok = Number(tempKokend.replace(",", "."));
  const sm = Number(tempSmeltend.replace(",", "."));
  const kokSt = Number.isFinite(kok) ? gteMinStatus(kok, 100) : "empty";
  const smSt = Number.isFinite(sm) ? lteMaxStatus(sm, 0) : "empty";
  const afwijking = useMemo(() => {
    if (!Number.isFinite(kok) || !Number.isFinite(sm)) return null;
    return calcAfwijking(kok, sm);
  }, [kok, sm]);

  const warn = afwijking != null && afwijking > 1;

  async function save() {
    if (!Number.isFinite(kok) || !Number.isFinite(sm)) {
      setMessage("Enter both temperatures.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const afw = calcAfwijking(kok, sm);
    const { error } = await supabase.from("haccp_thermometers").insert({
      store_id: storeId,
      datum,
      temp_kokend: kok,
      temp_smeltend: sm,
      afwijking: afw,
      maatregel: maatregel.trim() || null,
      paraaf: paraaf.trim() || null,
    });
    setSaving(false);
    if (error) setMessage(error.message);
    else {
      setMessage("Test saved.");
      setTempKokend("");
      setTempSmeltend("");
      setMaatregel("");
      setParaaf("");
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <p className="help-text">
        Boiling water target ≥ 100 °C; ice melting target 0 °C. Deviation = largest deviation from these targets.
      </p>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">Test date</span>
        <input type="date" className="input" value={datum} onChange={(e) => setDatum(e.target.value)} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">Boiling temperature (°C)</span>
          <input
            className={temperatureInputClass(kokSt)}
            inputMode="decimal"
            value={tempKokend}
            onChange={(e) => setTempKokend(e.target.value)}
            placeholder="100"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">Ice melting temperature (°C)</span>
          <input
            className={temperatureInputClass(smSt)}
            inputMode="decimal"
            value={tempSmeltend}
            onChange={(e) => setTempSmeltend(e.target.value)}
            placeholder="0"
          />
        </label>
      </div>

      {afwijking != null && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${ warn ? "border-accent-orange bg-brand-sand/60 text-ink" : "border-brand-green/10 bg-background text-ink " }`}
        >
          <strong>Calculated deviation:</strong> {afwijking.toFixed(2)} °C
          {warn && (
            <span className="mt-1 block text-xs">
              &gt; 1 °C — record corrective action (e.g. calibrate or replace thermometer).
            </span>
          )}
        </div>
      )}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">Corrective action (optional)</span>
        <textarea className="input min-h-[72px]" value={maatregel} onChange={(e) => setMaatregel(e.target.value)} />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">Initials</span>
        <input className="input" value={paraaf} onChange={(e) => setParaaf(e.target.value)} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save test"}
        </button>
        {message && <span className="help-text">{message}</span>}
      </div>
    </div>
  );
}
