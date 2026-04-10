"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import { localCalendarDateString } from "@/lib/date";
import { ensureEffectiveDailyRevenueTargetCents } from "@/lib/revenueTarget";

type DashboardStatus = {
  stocktakeComplete: boolean;
  ordersSent: boolean;
};

export default function DashboardPage() {
  const { locationId, setLocationId, locationOptions, loading: locationsLoading, error: locationsError } = useLocation();
  const [date, setDate] = useState(() => localCalendarDateString());
  const [expectedRevenue, setExpectedRevenue] = useState("");
  const [revenueSaving, setRevenueSaving] = useState(false);
  const [status, setStatus] = useState<DashboardStatus>({ stocktakeComplete: false, ordersSent: false });
  const [statusLoading, setStatusLoading] = useState(false);
  const [revenueError, setRevenueError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId || !date) {
      setStatus({ stocktakeComplete: false, ordersSent: false });
      return;
    }
    setStatusLoading(true);
    const supabase = createClient();
    const load = async () => {
      try {
        const [lpiRes, countRes, ordersRes] = await Promise.all([
          supabase
            .from("location_prep_items")
            .select("id", { count: "exact", head: true })
            .eq("location_id", locationId),
          supabase
            .from("daily_prep_counts")
            .select("id", { count: "exact", head: true })
            .eq("location_id", locationId)
            .eq("date", date),
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("location_id", locationId)
            .eq("order_date", date)
            .eq("status", "submitted"),
        ]);
        const totalItems = lpiRes.count ?? 0;
        const countedItems = countRes.count ?? 0;
        const submittedOrders = ordersRes.count ?? 0;
        setStatus({
          stocktakeComplete: totalItems > 0 && countedItems >= totalItems,
          ordersSent: submittedOrders > 0,
        });
      } catch {
        setStatus({ stocktakeComplete: false, ordersSent: false });
      } finally {
        setStatusLoading(false);
      }
    };
    void load();
  }, [locationId, date]);

  useEffect(() => {
    if (!locationId || !date) return;
    const supabase = createClient();
    void ensureEffectiveDailyRevenueTargetCents(supabase, locationId, date).then((cents) => {
      if (cents != null) setExpectedRevenue(String(cents / 100));
      else setExpectedRevenue("");
    });
  }, [locationId, date]);

  const saveRevenue = useCallback(() => {
    if (!locationId || !date) return;
    const cents = expectedRevenue.trim() ? Math.round(parseFloat(expectedRevenue) * 100) : 0;
    setRevenueSaving(true);
    const supabase = createClient();
    supabase
      .from("daily_revenue_targets")
      .upsert(
        { location_id: locationId, date, target_amount_cents: cents },
        { onConflict: "location_id,date" }
      )
      .then(
        ({ error }) => {
          if (error) setRevenueError(error.message);
          setRevenueSaving(false);
        },
        () => setRevenueSaving(false)
      );
  }, [locationId, date, expectedRevenue]);

  useEffect(() => {
    if (expectedRevenue.trim() === "") return;
    const t = setTimeout(saveRevenue, 800);
    return () => clearTimeout(t);
  }, [expectedRevenue, saveRevenue]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Dashboard
          </h1>
          <Link
            href="/admin"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Admin
          </Link>
        </div>

        {(locationsError || revenueError) && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {locationsError ?? revenueError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="location" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Your location
            </label>
            <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
              Choose the location you work at. This is used everywhere in the app until you change it here.
            </p>
            <select
              id="location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              disabled={locationsLoading}
            >
              <option value="">Select location</option>
              {locationOptions.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="date" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Today&apos;s date
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label htmlFor="revenue" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Expected revenue (€)
            </label>
            <input
              id="revenue"
              type="number"
              step="0.01"
              min={0}
              placeholder="0"
              value={expectedRevenue}
              onChange={(e) => setExpectedRevenue(e.target.value)}
              className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {revenueSaving && <p className="mt-1 text-xs text-zinc-500">Saving…</p>}
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatusCard
            title="Stocktake complete?"
            done={status.stocktakeComplete}
            loading={statusLoading}
            href="/stocktake"
          />
          <StatusCard
            title="Prep list ready?"
            done={status.stocktakeComplete}
            loading={statusLoading}
            href="/prep-list"
          />
          <StatusCard
            title="Orders sent?"
            done={status.ordersSent}
            loading={statusLoading}
            href="/ordering"
          />
        </div>

        <div className="mt-8">
          <Link
            href="/dashboard/haccp"
            className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-4 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-700/50"
          >
            <span>
              <span className="block font-medium text-zinc-900 dark:text-zinc-50">HACCP-registratie</span>
              <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
                Temperaturen, ingangscontrole, schoonmaak, thermometers
              </span>
            </span>
            <span className="text-zinc-400" aria-hidden>
              →
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}

function StatusCard({
  title,
  done,
  loading,
  href,
}: {
  title: string;
  done: boolean;
  loading: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-700/50"
    >
      <h2 className="font-medium text-zinc-900 dark:text-zinc-100">{title}</h2>
      <div className="mt-2">
        {loading ? (
          <span className="text-sm text-zinc-400">…</span>
        ) : (
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
              done
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
            }`}
          >
            {done ? "Yes" : "Not yet"}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">Open →</p>
    </Link>
  );
}
