"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import type { RawIngredient, RawIngredientLocationOrdering } from "@/lib/types";

type RawRow = RawIngredient & {
  loc_daily_need_multiplier?: number | null;
  loc_standing_order_packs?: number | null;
};

type SavingState = Record<string, boolean>;
type MsgState = Record<string, string>;

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "" || t === "—") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export default function OrderingOverridesPage() {
  const { locationId, locationOptions } = useLocation();
  const [rows, setRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingGlobal, setSavingGlobal] = useState<SavingState>({});
  const [savingLoc, setSavingLoc] = useState<SavingState>({});
  const [msgs, setMsgs] = useState<MsgState>({});
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const [rawRes, locRes] = await Promise.all([
      supabase
        .from("raw_ingredients")
        .select(
          "id, name, unit, location_id, ordering_daily_need_multiplier, ordering_min_order_packs, ordering_max_order_base, ordering_min_order_base, stock_par_kind, stock_par_min_amount, stock_par_min_packs, stock_par_order_packs"
        )
        .eq("location_id", locationId)
        .order("name"),
      supabase
        .from("raw_ingredient_location_ordering")
        .select("raw_ingredient_id, daily_need_multiplier, standing_order_packs")
        .eq("location_id", locationId),
    ]);
    if (rawRes.error) { setError(rawRes.error.message); setLoading(false); return; }
    const locMap = new Map<string, RawIngredientLocationOrdering>();
    for (const r of ((locRes.data ?? []) as RawIngredientLocationOrdering[])) {
      locMap.set(r.raw_ingredient_id, r);
    }
    const combined: RawRow[] = ((rawRes.data ?? []) as RawIngredient[]).map((r) => {
      const lo = locMap.get(r.id);
      return {
        ...r,
        loc_daily_need_multiplier: lo?.daily_need_multiplier ?? null,
        loc_standing_order_packs: lo?.standing_order_packs ?? null,
      };
    });
    setRows(combined);
    setLoading(false);
  }, [locationId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const setMsg = (id: string, msg: string) => {
    setMsgs((m) => ({ ...m, [id]: msg }));
    setTimeout(() => setMsgs((m) => ({ ...m, [id]: "" })), 2500);
  };

  const saveGlobal = async (row: RawRow, fields: Record<string, unknown>) => {
    setSavingGlobal((s) => ({ ...s, [row.id]: true }));
    try {
      const res = await fetch("/api/admin/raw-ingredients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, fields }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) { setMsg(row.id, `Error: ${json.error ?? res.statusText}`); }
      else {
        setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, ...fields } : r));
        setMsg(row.id, "Saved");
      }
    } catch (e) {
      setMsg(row.id, `Error: ${e instanceof Error ? e.message : "unknown"}`);
    }
    setSavingGlobal((s) => ({ ...s, [row.id]: false }));
  };

  const saveLocOverride = async (row: RawRow, fields: { daily_need_multiplier?: number | null; standing_order_packs?: number | null }) => {
    if (!locationId) return;
    const locKey = `loc_${row.id}`;
    setSavingLoc((s) => ({ ...s, [row.id]: true }));
    try {
      const res = await fetch("/api/admin/raw-ingredient-location-ordering", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_ingredient_id: row.id, location_id: locationId, ...fields }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) { setMsg(locKey, `Error: ${json.error ?? res.statusText}`); }
      else {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  loc_daily_need_multiplier:
                    "daily_need_multiplier" in fields ? fields.daily_need_multiplier ?? r.loc_daily_need_multiplier : r.loc_daily_need_multiplier,
                  loc_standing_order_packs:
                    "standing_order_packs" in fields ? fields.standing_order_packs ?? r.loc_standing_order_packs : r.loc_standing_order_packs,
                }
              : r
          )
        );
        setMsg(locKey, "Saved");
      }
    } catch (e) {
      setMsg(locKey, `Error: ${e instanceof Error ? e.message : "unknown"}`);
    }
    setSavingLoc((s) => ({ ...s, [row.id]: false }));
  };

  const locationName = locationOptions.find((l) => l.id === locationId)?.name ?? "";
  const filtered = filter
    ? rows.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
    : rows;

  return (
    <>
      <TopNav />
      <main className="max-w-5xl mx-auto p-4">
        <Link href="/admin" className="text-blue-600 text-sm">
          &larr; Admin
        </Link>
        <h1 className="text-xl font-bold mt-2 mb-1">Ordering Overrides — {locationName}</h1>
        <p className="text-xs text-ink-soft mb-4">
          Global columns apply to all locations. Location columns apply only to the selected location.
          Leave blank to use the hardcoded defaults.
        </p>

        {error && <p className="text-red-600 mb-2">{error}</p>}

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
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b text-left bg-gray-50">
                  <th className="py-2 px-2 font-semibold">Ingredient</th>
                  <th className="py-2 px-2 font-semibold text-right" title="Global daily-need multiplier">Multiplier (global)</th>
                  <th className="py-2 px-2 font-semibold text-right" title="Min order packs threshold">Min packs</th>
                  <th className="py-2 px-2 font-semibold text-right" title="Max order base units">Max base</th>
                  <th className="py-2 px-2 font-semibold text-right" title="Stock par kind">Par kind</th>
                  <th className="py-2 px-2 font-semibold text-right" title="Stock par min amount (for base) or min packs (for packs)">Par min</th>
                  <th className="py-2 px-2 font-semibold text-right" title="Stock par order packs (MOQ)">Par order packs</th>
                  <th className="py-2 px-2 font-semibold text-right" title="Per-location daily multiplier">Loc multiplier</th>
                  <th className="py-2 px-2 font-semibold text-right" title="Per-location standing order packs">Loc standing</th>
                  <th className="py-2 px-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <OverrideRow
                    key={row.id}
                    row={row}
                    isSavingGlobal={savingGlobal[row.id] ?? false}
                    isSavingLoc={savingLoc[row.id] ?? false}
                    globalMsg={msgs[row.id] ?? ""}
                    locMsg={msgs[`loc_${row.id}`] ?? ""}
                    onSaveGlobal={(fields) => void saveGlobal(row, fields)}
                    onSaveLocOverride={(fields) => void saveLocOverride(row, fields)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

function NumCell({
  value,
  onCommit,
  disabled,
  step = "0.01",
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  disabled: boolean;
  step?: string;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDraft(value != null ? String(value) : ""), [value]);

  const commit = () => {
    const parsed = numOrNull(draft);
    if (parsed === (value ?? null)) return;
    onCommit(parsed);
  };

  return (
    <input
      type="number"
      step={step}
      className="w-20 border rounded px-1 py-0.5 text-right"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      disabled={disabled}
    />
  );
}

function SelectCell({
  value,
  onCommit,
  disabled,
}: {
  value: string | null | undefined;
  onCommit: (v: string | null) => void;
  disabled: boolean;
}) {
  return (
    <select
      className="border rounded px-1 py-0.5"
      value={value ?? ""}
      onChange={(e) => onCommit(e.target.value === "" ? null : e.target.value)}
      disabled={disabled}
    >
      <option value="">—</option>
      <option value="base">base</option>
      <option value="packs">packs</option>
    </select>
  );
}

function OverrideRow({
  row,
  isSavingGlobal,
  isSavingLoc,
  globalMsg,
  locMsg,
  onSaveGlobal,
  onSaveLocOverride,
}: {
  row: RawRow;
  isSavingGlobal: boolean;
  isSavingLoc: boolean;
  globalMsg: string;
  locMsg: string;
  onSaveGlobal: (fields: Record<string, unknown>) => void;
  onSaveLocOverride: (fields: { daily_need_multiplier?: number | null; standing_order_packs?: number | null }) => void;
}) {
  const disabled = isSavingGlobal || isSavingLoc;
  const msg = globalMsg || locMsg;

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="py-1 px-2 font-medium">{row.name}</td>

      {/* Global: ordering_daily_need_multiplier */}
      <td className="py-1 px-2 text-right">
        <NumCell
          value={row.ordering_daily_need_multiplier}
          onCommit={(v) => onSaveGlobal({ ordering_daily_need_multiplier: v })}
          disabled={disabled}
        />
      </td>

      {/* Global: ordering_min_order_packs */}
      <td className="py-1 px-2 text-right">
        <NumCell
          value={row.ordering_min_order_packs}
          onCommit={(v) => onSaveGlobal({ ordering_min_order_packs: v })}
          disabled={disabled}
        />
      </td>

      {/* Global: ordering_max_order_base */}
      <td className="py-1 px-2 text-right">
        <NumCell
          value={row.ordering_max_order_base}
          onCommit={(v) => onSaveGlobal({ ordering_max_order_base: v })}
          disabled={disabled}
          step="1"
        />
      </td>

      {/* Global: stock_par_kind */}
      <td className="py-1 px-2 text-right">
        <SelectCell
          value={row.stock_par_kind}
          onCommit={(v) => onSaveGlobal({ stock_par_kind: v })}
          disabled={disabled}
        />
      </td>

      {/* Global: stock_par_min_amount / stock_par_min_packs */}
      <td className="py-1 px-2 text-right">
        {row.stock_par_kind === "base" ? (
          <NumCell
            value={row.stock_par_min_amount}
            onCommit={(v) => onSaveGlobal({ stock_par_min_amount: v })}
            disabled={disabled}
            step="1"
          />
        ) : row.stock_par_kind === "packs" ? (
          <NumCell
            value={row.stock_par_min_packs}
            onCommit={(v) => onSaveGlobal({ stock_par_min_packs: v })}
            disabled={disabled}
          />
        ) : (
          <span className="text-ink-soft">—</span>
        )}
      </td>

      {/* Global: stock_par_order_packs */}
      <td className="py-1 px-2 text-right">
        {row.stock_par_kind === "packs" ? (
          <NumCell
            value={row.stock_par_order_packs}
            onCommit={(v) => onSaveGlobal({ stock_par_order_packs: v })}
            disabled={disabled}
            step="1"
          />
        ) : (
          <span className="text-ink-soft">—</span>
        )}
      </td>

      {/* Location: daily_need_multiplier */}
      <td className="py-1 px-2 text-right">
        <NumCell
          value={row.loc_daily_need_multiplier}
          onCommit={(v) => onSaveLocOverride({ daily_need_multiplier: v })}
          disabled={disabled}
        />
      </td>

      {/* Location: standing_order_packs */}
      <td className="py-1 px-2 text-right">
        <NumCell
          value={row.loc_standing_order_packs}
          onCommit={(v) => onSaveLocOverride({ standing_order_packs: v != null ? Math.round(v) : null })}
          disabled={disabled}
          step="1"
        />
      </td>

      <td className="py-1 px-2 text-xs">
        {disabled ? (
          <span className="text-gray-400">Saving…</span>
        ) : msg ? (
          <span className={msg.startsWith("Error") ? "text-red-600" : "text-green-600"}>{msg}</span>
        ) : null}
      </td>
    </tr>
  );
}
