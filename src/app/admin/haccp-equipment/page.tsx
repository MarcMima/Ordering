"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase";
import type { HaccpStoreEquipmentRow } from "@/lib/haccp/types";

export default function HaccpEquipmentAdminPage() {
  const [storeId, setStoreId] = useState(1);
  const [rows, setRows] = useState<HaccpStoreEquipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from("haccp_store_equipment")
      .select("*")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true });
    setLoading(false);
    if (e) {
      setError(e.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as HaccpStoreEquipmentRow[]);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this equipment line?")) return;
    const supabase = createClient();
    const { error: e } = await supabase.from("haccp_store_equipment").delete().eq("id", id);
    if (e) setError(e.message);
    else void load();
  }

  async function addRow() {
    const supabase = createClient();
    const nextOrder =
      rows.length === 0 ? 10 : Math.max(...rows.map((r) => r.sort_order)) + 10;
    const { error: e } = await supabase.from("haccp_store_equipment").insert({
      store_id: storeId,
      sort_order: nextOrder,
      label: "New appliance",
      norm_display: "Max 7°C",
      norm_kind: "lte",
      norm_value: 7,
      show_fifo: true,
      show_exact_temp: true,
    });
    if (e) setError(e.message);
    else void load();
  }

  async function patch(id: string, patch: Partial<HaccpStoreEquipmentRow>) {
    setSavingId(id);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase
      .from("haccp_store_equipment")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    setSavingId(null);
    if (e) setError(e.message);
    else setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/admin"
              className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
            >
              ← Admin
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              HACCP equipment per store
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Each row is one appliance line on the weekly temperature sheet. Use a different{" "}
              <strong>store ID</strong> for another restaurant layout (set{" "}
              <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">locations.haccp_store_id</code>{" "}
              to match).
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">Store ID</span>
            <input
              type="number"
              className="input w-28"
              min={1}
              value={storeId}
              onChange={(e) => setStoreId(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => void addRow()}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add row
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-zinc-500">Loading…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800">
                  <th className="px-2 py-2 text-left">Order</th>
                  <th className="px-2 py-2 text-left">Label</th>
                  <th className="px-2 py-2 text-left">Norm (display)</th>
                  <th className="px-2 py-2 text-left">Kind</th>
                  <th className="px-2 py-2 text-left">Value</th>
                  <th className="px-2 py-2 text-center">FIFO</th>
                  <th className="px-2 py-2 text-center">Exact °</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-700/80">
                    <td className="p-1">
                      <input
                        type="number"
                        className="input w-16 py-1 text-xs"
                        defaultValue={r.sort_order}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n)) void patch(r.id, { sort_order: n });
                        }}
                      />
                    </td>
                    <td className="p-1">
                      <input
                        className="input min-w-[10rem] py-1 text-xs"
                        defaultValue={r.label}
                        onBlur={(e) => void patch(r.id, { label: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      <input
                        className="input min-w-[6rem] py-1 text-xs"
                        defaultValue={r.norm_display}
                        onBlur={(e) => void patch(r.id, { norm_display: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      <select
                        className="input py-1 text-xs"
                        value={r.norm_kind}
                        onChange={(e) =>
                          void patch(r.id, { norm_kind: e.target.value as "lte" | "gte" })
                        }
                      >
                        <option value="lte">≤ / max (lte)</option>
                        <option value="gte">≥ / min (gte)</option>
                      </select>
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input w-20 py-1 text-xs tabular-nums"
                        defaultValue={String(r.norm_value)}
                        onBlur={(e) => {
                          const n = Number(e.target.value.replace(",", "."));
                          if (Number.isFinite(n)) void patch(r.id, { norm_value: n });
                        }}
                      />
                    </td>
                    <td className="p-1 text-center">
                      <input
                        type="checkbox"
                        checked={r.show_fifo}
                        onChange={(e) => void patch(r.id, { show_fifo: e.target.checked })}
                      />
                    </td>
                    <td className="p-1 text-center">
                      <input
                        type="checkbox"
                        checked={r.show_exact_temp}
                        onChange={(e) => void patch(r.id, { show_exact_temp: e.target.checked })}
                      />
                    </td>
                    <td className="p-1 text-right">
                      <button
                        type="button"
                        onClick={() => void remove(r.id)}
                        disabled={savingId === r.id}
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
