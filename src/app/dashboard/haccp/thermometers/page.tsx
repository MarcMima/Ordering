"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HaccpFormGate } from "@/components/HaccpFormGate";
import { TopNav } from "@/components/TopNav";
import { ThermometerForm } from "@/components/haccp/ThermometerForm";
import { useLocation } from "@/contexts/LocationContext";
import { APP_FORM_KEYS } from "@/lib/appFormKeys";
import {
  isThermometerQuietPeriod,
  THERMOMETER_QUIET_WEEKS,
  thermometerQuietEndsDate,
} from "@/lib/haccp/thermometerSchedule";
import { getHaccpStoreId } from "@/lib/haccp/types";
import { createClient } from "@/lib/supabase";
export default function ThermometersPage() {
  const { locations, locationId } = useLocation();
  const storeId = getHaccpStoreId(locations, locationId);
  const [latest, setLatest] = useState<{
    datum: string;
    afwijking: number | null;
    maatregel: string | null;
  } | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data } = await supabase
        .from("haccp_thermometers")
        .select("datum, afwijking, maatregel")
        .eq("store_id", storeId)
        .order("datum", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatest(data as typeof latest);
      setLoadingLatest(false);
    })();
  }, [storeId]);

  const quiet = isThermometerQuietPeriod(latest);
  const quietEnd = latest ? thermometerQuietEndsDate(latest.datum) : null;

  return (
    <HaccpFormGate formKey={APP_FORM_KEYS.haccp_thermometers}>
    <div className="min-h-screen bg-background font-sans">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6">
        <div className="mb-6">
          <Link
            href="/dashboard/haccp"
            className="text-sm font-medium text-ink-soft/80 hover:text-ink"
          >
            ← HACCP overview
          </Link>
        </div>
        <h1 className="mb-2 section-title text-xl sm:text-2xl">
          Thermometer test
        </h1>
        <p className="mb-6 help-text">
          Intended as a quarterly check. After a passing test without corrective action, the overview moves this
          card to the bottom and tones it down for {THERMOMETER_QUIET_WEEKS} weeks.
        </p>

        {loadingLatest && <p className="mb-6 help-text">Loading…</p>}

        {!loadingLatest && quiet && latest && quietEnd && (
          <div className="mb-6 badge-success rounded-xl border px-4 py-3 text-sm">
            <strong>Quiet period.</strong> Last test on {latest.datum} was within tolerance and no corrective action
            was recorded. Routine prominence returns from{" "}
            <span className="font-medium tabular-nums">
              {quietEnd.toLocaleDateString(undefined, { dateStyle: "medium" })}
            </span>
            . You can still add an extra test below if needed.
          </div>
        )}

        {!loadingLatest && !quiet && <ThermometerForm />}

        {!loadingLatest && quiet && (
          <details className="card">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
              <span className="underline decoration-brand-tan underline-offset-2">Optional: record another test</span>
            </summary>
            <div className="border-t border-brand-green/10 p-4">
              <ThermometerForm />
            </div>
          </details>
        )}
      </main>
    </div>
    </HaccpFormGate>
  );
}
