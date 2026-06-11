"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LocationPicker } from "@/components/LocationPicker";
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
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div
          className="mb-8 h-1 rounded-full bg-gradient-to-r from-brand-green via-brand-sage to-brand-sand"
          aria-hidden
        />
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="page-title">Dashboard</h1>
          <Link href="/admin" className="btn-ghost shrink-0 px-2 text-sm">
            Admin
          </Link>
        </div>

        {(locationsError || revenueError) && (
          <div className="alert-error mb-6">{locationsError ?? revenueError}</div>
        )}

        <div className="card space-y-6">
          <div>
            <label htmlFor="location" className="label">
              Your location
            </label>
            <p className="help-text mb-3">
              Choose the location you work at. This is used everywhere in the app until you change it here.
            </p>
            <LocationPicker
              value={locationId}
              onChange={setLocationId}
              options={locationOptions}
              loading={locationsLoading}
            />
          </div>

          <div>
            <label htmlFor="date" className="label">
              Today&apos;s date
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-lg"
            />
          </div>

          <div>
            <label htmlFor="revenue" className="label">
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
              className="input-lg"
            />
            {revenueSaving && <p className="help-text mt-1">Saving…</p>}
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
          <Link href="/dashboard/haccp" className="card-interactive flex items-center justify-between px-4 py-4">
            <span>
              <span className="section-title block">HACCP</span>
              <span className="help-text mt-1 block">
                Temperatures, goods in, cleaning, thermometer tests
              </span>
            </span>
            <span className="text-brand-sage" aria-hidden>
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
    <Link href={href} className="card-interactive block">
      <h2 className="font-heading text-base font-semibold text-brand-green">{title}</h2>
      <div className="mt-2">
        {loading ? (
          <span className="help-text">…</span>
        ) : (
          <span className={done ? "badge-success" : "badge-pending"}>
            {done ? "Yes" : "Not yet"}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm font-medium text-brand-green/80">Open →</p>
    </Link>
  );
}
