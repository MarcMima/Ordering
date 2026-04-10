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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6">
        <div className="mb-6">
          <Link
            href="/dashboard/haccp"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← HACCP overview
          </Link>
        </div>
        <h1 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-2xl">
          Thermometer test
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Intended as a quarterly check. After a passing test without corrective action, the overview moves this
          card to the bottom and tones it down for {THERMOMETER_QUIET_WEEKS} weeks.
        </p>

        {loadingLatest && <p className="mb-6 text-sm text-zinc-500">Loading…</p>}

        {!loadingLatest && quiet && latest && quietEnd && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
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
          <details className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
              <span className="underline decoration-zinc-400 underline-offset-2">Optional: record another test</span>
            </summary>
            <div className="border-t border-zinc-200 p-4 dark:border-zinc-600">
              <ThermometerForm />
            </div>
          </details>
        )}
      </main>
    </div>
    </HaccpFormGate>
  );
}
