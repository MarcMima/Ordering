"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BereidenServerenForm } from "@/components/haccp/BereidenServerenForm";
import { HaccpFormGate } from "@/components/HaccpFormGate";
import { HaccpPageHeader } from "@/components/haccp/HaccpPageHeader";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "@/contexts/LocationContext";
import { APP_FORM_KEYS } from "@/lib/appFormKeys";
import type { HaccpBereidenRow } from "@/lib/haccp/types";
import { getHaccpStoreId } from "@/lib/haccp/types";
import { createClient } from "@/lib/supabase";
import { getISOWeekAndYear, parseWeekYearParam } from "@/lib/haccp/week";

function Inner() {
  const { locations, locationId } = useLocation();
  const searchParams = useSearchParams();
  const parsed = parseWeekYearParam(searchParams.get("week"));
  const fb = getISOWeekAndYear(new Date());
  const week = parsed?.week ?? fb.week;
  const year = parsed?.year ?? fb.year;
  const [row, setRow] = useState<HaccpBereidenRow | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  const refetchWeek = useCallback(() => {
    const storeId = getHaccpStoreId(locations, locationId);
    const supabase = createClient();
    void (async () => {
      const { data, error } = await supabase
        .from("haccp_bereiden")
        .select("*")
        .eq("store_id", storeId)
        .eq("week_number", week)
        .eq("year", year)
        .maybeSingle();
      if (error) setErr(error.message);
      else setErr(null);
      setRow((data as HaccpBereidenRow | null) ?? null);
    })();
  }, [week, year, locations, locationId]);

  useEffect(() => {
    refetchWeek();
  }, [refetchWeek]);

  return (
    <HaccpFormGate formKey={APP_FORM_KEYS.haccp_prepare}>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <TopNav />
        <main className="mx-auto max-w-4xl px-4 py-6 pb-24 sm:px-6">
          <HaccpPageHeader title="Prepare & serve" week={week} year={year} basePath="/dashboard/haccp/bereiden" />
          {err && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {err}
            </div>
          )}
          <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
            Aligned with the paper form &ldquo;Registratie bereiden / serveren&rdquo;: cooling (hummus), core
            temperatures, serving checks, reheat, and hot/cold lines. Fryer oil temperatures are on the weekly
            equipment sheet.
          </p>
          {row === undefined ? (
            <p className="text-zinc-500">Loading…</p>
          ) : (
            <BereidenServerenForm
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

export default function BereidenPage() {
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
