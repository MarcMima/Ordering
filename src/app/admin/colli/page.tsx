"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";

type RawRow = {
  id: string;
  name: string;
  unit: string;
  order_pack_multiple: number | null;
};

export default function AdminColliPage() {
  const { locationId, locationOptions } = useLocation();
  const [rows, setRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedMsg, setSavedMsg] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from("raw_ingredients")
      .select("id, name, unit, order_pack_multiple")
      .eq("location_id", locationId)
      .order("name");
    if (e) {
      setError(e.message);
      setLoading(false);
      return;
    }
    setRows((data as RawRow[]) ?? []);
    setError(null);
    setLoading(false);
  }, [locationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (id: string, value: number | null) => {
    setSaving((s) => ({ ...s, [id]: true }));
    setSavedMsg((s) => ({ ...s, [id]: "" }));
    try {
      const res = await fetch("/api/admin/raw-ingredients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, fields: { order_pack_multiple: value } }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) {
        setSavedMsg((s) => ({ ...s, [id]: `Error: ${json.error ?? res.statusText}` }));
      } else {
        setSavedMsg((s) => ({ ...s, [id]: "Saved" }));
        setRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, order_pack_multiple: value } : r))
        );
        setTimeout(() => setSavedMsg((s) => ({ ...s, [id]: "" })), 2000);
      }
    } catch (err) {
      setSavedMsg((s) => ({ ...s, [id]: `Error: ${err instanceof Error ? err.message : "unknown"}` }));
    }
    setSaving((s) => ({ ...s, [id]: false }));
  };

  const filtered = filter
    ? rows.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
    : rows;

  const locationName =
    locationOptions.find((l) => l.id === locationId)?.name ?? "";

  return (
    <>
      <TopNav />
      <main className="max-w-2xl mx-auto p-4">
        <Link href="/admin" className="text-blue-600 text-sm">
          &larr; Admin
        </Link>
        <h1 className="text-xl font-bold mt-2 mb-4">
          Order Colli — {locationName}
        </h1>

        {error && (
          <p className="text-red-600 mb-2">{error}</p>
        )}

        <input
          type="text"
          placeholder="Filter by name..."
          className="w-full border rounded px-3 py-2 mb-4"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1">Ingredient</th>
                <th className="py-1 w-20">Unit</th>
                <th className="py-1 w-28">Colli</th>
                <th className="py-1 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <ColliRow
                  key={row.id}
                  row={row}
                  isSaving={saving[row.id] ?? false}
                  msg={savedMsg[row.id] ?? ""}
                  onSave={save}
                />
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}

function ColliRow({
  row,
  isSaving,
  msg,
  onSave,
}: {
  row: RawRow;
  isSaving: boolean;
  msg: string;
  onSave: (id: string, value: number | null) => void;
}) {
  const [draft, setDraft] = useState(
    row.order_pack_multiple != null ? String(row.order_pack_multiple) : ""
  );

  const commit = () => {
    const trimmed = draft.trim();
    const val = trimmed === "" ? null : parseInt(trimmed, 10);
    if (val != null && (!Number.isFinite(val) || val < 1)) return;
    if (val === row.order_pack_multiple) return;
    onSave(row.id, val);
  };

  return (
    <tr className="border-b">
      <td className="py-1">{row.name}</td>
      <td className="py-1 text-gray-500">{row.unit}</td>
      <td className="py-1">
        <input
          type="number"
          min="1"
          className="w-20 border rounded px-2 py-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          disabled={isSaving}
        />
      </td>
      <td className="py-1 text-xs">
        {isSaving ? (
          <span className="text-gray-400">Saving...</span>
        ) : msg ? (
          <span className={msg.startsWith("Error") ? "text-red-600" : "text-green-600"}>
            {msg}
          </span>
        ) : null}
      </td>
    </tr>
  );
}
