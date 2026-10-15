"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import { localCalendarDateString } from "@/lib/date";

/**
 * Planned Uber Eats / Thuisbezorgd promotions. Only read by the sales forecast
 * (fn_revenue_forecast) that feeds the shadow order suggestion; nothing a manager sees
 * changes. Running promotions are also detected automatically from Butlaroo sales, so
 * entering one here mainly helps for the first days, before the sales show it.
 */

type PromoRow = {
  id: string;
  location_id: string | null;
  channel: "uber_eats" | "just_eat";
  starts_on: string;
  ends_on: string;
  label: string | null;
  created_by: string | null;
  source: "manual" | "sheet_jet" | "sheet_uber";
};

const CHANNEL_LABEL: Record<PromoRow["channel"], string> = {
  uber_eats: "Uber Eats",
  just_eat: "Thuisbezorgd",
};

export default function AdminPromotionsPage() {
  const { locationOptions } = useLocation();
  const today = localCalendarDateString();
  const [rows, setRows] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    location_id: "",
    channel: "uber_eats" as PromoRow["channel"],
    starts_on: today,
    ends_on: today,
    label: "",
  });

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from("planned_promotions")
      .select("id, location_id, channel, starts_on, ends_on, label, created_by, source")
      .order("starts_on", { ascending: false })
      .limit(100);
    if (e) setError(e.message);
    else {
      setRows((data as PromoRow[]) ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const add = async () => {
    if (form.ends_on < form.starts_on) {
      setError("End date is before start date.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { error: e } = await supabase.from("planned_promotions").insert({
      location_id: form.location_id || null,
      channel: form.channel,
      starts_on: form.starts_on,
      ends_on: form.ends_on,
      label: form.label.trim() || null,
      created_by: auth.user?.email ?? null,
    });
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    setForm((f) => ({ ...f, label: "" }));
    await load();
  };

  const remove = async (id: string) => {
    const supabase = createClient();
    const { error: e } = await supabase.from("planned_promotions").delete().eq("id", id);
    if (e) setError(e.message);
    else setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const locationName = (id: string | null) =>
    id == null ? "All locations" : (locationOptions.find((l) => l.id === id)?.name ?? "?");

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl p-4">
        <Link href="/admin" className="text-sm text-blue-600">
          &larr; Admin
        </Link>
        <h1 className="mt-2 text-xl font-medium">Delivery promotions</h1>
        <p className="help-text mt-1">
          Uber Eats and Thuisbezorgd promotions, used only by the sales forecast behind the
          shadow order suggestion. The platforms&apos; marketing calendars are loaded every
          night, and running promotions are also picked up from the sales. Add one here only
          when it is in neither calendar.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-hairline p-3 sm:grid-cols-2">
          <label className="text-sm">
            Location
            <select
              className="mt-1 w-full rounded border border-hairline bg-surface px-2 py-1"
              value={form.location_id}
              onChange={(e) => setForm({ ...form, location_id: e.target.value })}
            >
              <option value="">All locations</option>
              {locationOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Channel
            <select
              className="mt-1 w-full rounded border border-hairline bg-surface px-2 py-1"
              value={form.channel}
              onChange={(e) =>
                setForm({ ...form, channel: e.target.value as PromoRow["channel"] })
              }
            >
              <option value="uber_eats">Uber Eats</option>
              <option value="just_eat">Thuisbezorgd</option>
            </select>
          </label>
          <label className="text-sm">
            From
            <input
              type="date"
              className="mt-1 w-full rounded border border-hairline bg-surface px-2 py-1"
              value={form.starts_on}
              onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Until (inclusive)
            <input
              type="date"
              className="mt-1 w-full rounded border border-hairline bg-surface px-2 py-1"
              value={form.ends_on}
              onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Label (optional)
            <input
              className="mt-1 w-full rounded border border-hairline bg-surface px-2 py-1"
              placeholder="e.g. 25% off bowls"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </label>
          <div className="sm:col-span-2">
            <button className="btn-primary text-sm" disabled={saving} onClick={() => void add()}>
              {saving ? "Saving…" : "Add promotion"}
            </button>
          </div>
        </div>

        {error && <p className="alert-error mt-3 rounded-lg px-3 py-2 text-sm">{error}</p>}

        {loading ? (
          <p className="mt-4 text-sm text-ink-soft">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="help-text mt-4">No promotions entered yet.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                <th className="py-1.5 pr-2 font-medium">Location</th>
                <th className="py-1.5 pr-2 font-medium">Channel</th>
                <th className="py-1.5 pr-2 font-medium">Period</th>
                <th className="py-1.5 pr-2 font-medium">Label</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-hairline">
                  <td className="py-1.5 pr-2">{locationName(r.location_id)}</td>
                  <td className="py-1.5 pr-2">{CHANNEL_LABEL[r.channel]}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {r.starts_on} → {r.ends_on}
                  </td>
                  <td className="py-1.5 pr-2 text-ink-soft">
                    {r.label ?? "—"}
                    {r.source !== "manual" && (
                      <span className="ml-1 rounded-full bg-surface-muted px-1.5 py-0.5 text-xs">
                        from {r.source === "sheet_jet" ? "Thuisbezorgd" : "Uber"} calendar
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    {r.source === "manual" && (
                      <button className="btn-ghost text-xs" onClick={() => void remove(r.id)}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
