"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HaccpFormGate } from "@/components/HaccpFormGate";
import { TopNav } from "@/components/TopNav";
import { APP_FORM_KEYS } from "@/lib/appFormKeys";
import { HaccpPageHeader } from "@/components/haccp/HaccpPageHeader";
import { TemperaturenForm } from "@/components/haccp/TemperaturenForm";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import type { HaccpTemperaturenRow } from "@/lib/haccp/types";
import { getHaccpStoreId } from "@/lib/haccp/types";
import { getISOWeekAndYear, parseWeekYearParam } from "@/lib/haccp/week";

function Inner() {
  const searchParams = useSearchParams();
  const { locations, locationId } = useLocation();
  const parsed = parseWeekYearParam(searchParams.get("week"));
  const fb = getISOWeekAndYear(new Date());
  const week = parsed?.week ?? fb.week;
  const year = parsed?.year ?? fb.year;
  const [row, setRow] = useState<HaccpTemperaturenRow | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  const refetchWeek = useCallback(() => {
    const storeId = getHaccpStoreId(locations, locationId);
    const supabase = createClient();
    void (async () => {
      const { data, error } = await supabase
        .from("haccp_temperaturen")
        .select("*")
        .eq("store_id", storeId)
        .eq("week_number", week)
        .eq("year", year)
        .maybeSingle();
      if (error) setErr(error.message);
      else setErr(null);
      setRow(data as HaccpTemperaturenRow | null);
    })();
  }, [week, year, locations, locationId]);

  useEffect(() => {
    refetchWeek();
  }, [refetchWeek]);

  return (
    <HaccpFormGate formKey={APP_FORM_KEYS.haccp_temperatures}>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <TopNav />
        <main className="mx-auto max-w-4xl px-4 py-6 pb-24 sm:px-6">
          <HaccpPageHeader title="Temperatures" week={week} year={year} basePath="/dashboard/haccp/temperaturen" />
          {err && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {err}
            </div>
          )}
          {row === undefined ? (
            <p className="text-zinc-500">Loading…</p>
          ) : (
            <TemperaturenForm
              key={`${week}-${year}`}
              weekNumber={week}
              year={year}
              initial={row}
              onSaved={refetchWeek}
            />
          )}
        </main>
      </div>
    </HaccpFormGate>
  );
}

export default function TemperaturenPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 p-8 dark:bg-zinc-900">
          <p className="text-zinc-500">Loading…</p>
        </div>
      }
    >
      <Inner />
    </Suspense>
  );
}
