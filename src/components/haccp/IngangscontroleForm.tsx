"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import type { HaccpIngangscontroleRow } from "@/lib/haccp/types";
import { HACCP_STORE_ID } from "@/lib/haccp/types";

function emptyLine(week: number, year: number): Omit<HaccpIngangscontroleRow, "id" | "created_at"> {
  const today = new Date().toISOString().slice(0, 10);
  return {
    store_id: HACCP_STORE_ID(),
    week_number: week,
    year,
    datum: today,
    leverancier: "",
    product: "",
    soort: "V",
    temperatuur: null,
    verpakking_ok: null,
    tht_ok: null,
    correct: null,
    opmerkingen: null,
    paraaf: null,
  };
}

export function IngangscontroleForm({
  weekNumber,
  year,
  initialRows,
}: {
  weekNumber: number;
  year: number;
  initialRows: HaccpIngangscontroleRow[];
}) {
  const storeId = HACCP_STORE_ID();
  const [rows, setRows] = useState<Omit<HaccpIngangscontroleRow, "id" | "created_at">[]>(() =>
    initialRows.length > 0
      ? initialRows.map(({ id: _id, created_at: _c, ...r }) => r)
      : [emptyLine(weekNumber, year)]
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function update(
    index: number,
    patch: Partial<Omit<HaccpIngangscontroleRow, "id" | "created_at">>
  ) {
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
    const payload = rows
      .filter((r) => r.leverancier.trim() || r.product.trim())
      .map((r) => ({
        ...r,
        store_id: storeId,
        week_number: weekNumber,
        year,
      }));
    if (payload.length === 0) {
      setSaving(false);
      setMessage("Opgeslagen (geen regels).");
      return;
    }
    const { error } = await supabase.from("haccp_ingangscontrole").insert(payload);
    setSaving(false);
    if (error) setMessage(error.message);
    else setMessage("Opgeslagen.");
  }

  function addRow() {
    setRows((prev) => [...prev, emptyLine(weekNumber, year)]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Voeg per levering een regel toe. Vers (V) / conserven (C) / diepvries (D).
      </p>

      <div className="space-y-6">
        {rows.map((r, i) => (
          <div
            key={i}
            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700 dark:bg-zinc-900/40"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Levering {i + 1}</span>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-xs text-red-600 hover:underline dark:text-red-400"
              >
                Verwijder regel
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Datum</span>
                <input
                  type="date"
                  className="input"
                  value={r.datum}
                  onChange={(e) => update(i, { datum: e.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Soort</span>
                <select
                  className="input"
                  value={r.soort}
                  onChange={(e) => update(i, { soort: e.target.value as "V" | "C" | "D" })}
                >
                  <option value="V">Vers</option>
                  <option value="C">Conserven</option>
                  <option value="D">Diepvries</option>
                </select>
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Leverancier</span>
                <input
                  className="input"
                  value={r.leverancier}
                  onChange={(e) => update(i, { leverancier: e.target.value })}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Product</span>
                <input className="input" value={r.product} onChange={(e) => update(i, { product: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Temperatuur (°C)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input"
                  value={r.temperatuur ?? ""}
                  onChange={(e) => {
                    const t = e.target.value.trim();
                    update(i, { temperatuur: t === "" ? null : Number(t.replace(",", ".")) });
                  }}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm">
                  <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Verpakking</span>
                  <select
                    className="input"
                    value={r.verpakking_ok === null ? "" : r.verpakking_ok ? "1" : "0"}
                    onChange={(e) =>
                      update(i, {
                        verpakking_ok:
                          e.target.value === "" ? null : e.target.value === "1",
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="1">OK</option>
                    <option value="0">Niet OK</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-zinc-600 dark:text-zinc-400">THT</span>
                  <select
                    className="input"
                    value={r.tht_ok === null ? "" : r.tht_ok ? "1" : "0"}
                    onChange={(e) =>
                      update(i, {
                        tht_ok: e.target.value === "" ? null : e.target.value === "1",
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="1">OK</option>
                    <option value="0">Niet OK</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Beoordeling</span>
                  <select
                    className="input"
                    value={r.correct === null ? "" : r.correct ? "1" : "0"}
                    onChange={(e) =>
                      update(i, {
                        correct: e.target.value === "" ? null : e.target.value === "1",
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="1">Goed</option>
                    <option value="0">Fout</option>
                  </select>
                </label>
              </div>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Opmerkingen</span>
                <input
                  className="input"
                  value={r.opmerkingen ?? ""}
                  onChange={(e) => update(i, { opmerkingen: e.target.value || null })}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Paraaf</span>
                <input
                  className="input"
                  value={r.paraaf ?? ""}
                  onChange={(e) => update(i, { paraaf: e.target.value || null })}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
      >
        + Regel toevoegen
      </button>

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
