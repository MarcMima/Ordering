"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HaccpFormGate } from "@/components/HaccpFormGate";
import { TopNav } from "@/components/TopNav";
import { APP_FORM_KEYS } from "@/lib/appFormKeys";
import { HaccpPageHeader } from "@/components/haccp/HaccpPageHeader";
import { IngangscontroleForm } from "@/components/haccp/IngangscontroleForm";
import { createClient } from "@/lib/supabase";
import type { HaccpIngangscontroleRow } from "@/lib/haccp/types";
import { useLocation } from "@/contexts/LocationContext";
import { getHaccpStoreId } from "@/lib/haccp/types";
import { getISOWeekAndYear, parseWeekYearParam } from "@/lib/haccp/week";

function Inner() {
  const { locations, locationId } = useLocation();
  const searchParams = useSearchParams();
  const parsed = parseWeekYearParam(searchParams.get("week"));
  const fb = getISOWeekAndYear(new Date());
  const week = parsed?.week ?? fb.week;
  const year = parsed?.year ?? fb.year;
  const [rows, setRows] = useState<HaccpIngangscontroleRow[] | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  const refetchWeek = useCallback(() => {
    const storeId = getHaccpStoreId(locations, locationId);
    const supabase = createClient();
    void (async () => {
      const { data, error } = await supabase
        .from("haccp_ingangscontrole")
        .select("*")
        .eq("store_id", storeId)
        .eq("week_number", week)
        .eq("year", year)
        .order("datum");
      if (error) setErr(error.message);
      else setErr(null);
      setRows((data as HaccpIngangscontroleRow[]) ?? []);
    })();
  }, [week, year, locations, locationId]);

  useEffect(() => {
    refetchWeek();
  }, [refetchWeek]);

  return (
    <HaccpFormGate formKey={APP_FORM_KEYS.haccp_goods_in}>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <TopNav />
        <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6">
          <HaccpPageHeader title="Goods in" week={week} year={year} basePath="/dashboard/haccp/ingangscontrole" />
          {err && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {err}
            </div>
          )}
          {rows === undefined ? (
            <p className="text-zinc-500">Loading…</p>
          ) : (
            <IngangscontroleForm
              key={rows === undefined ? "loading" : `${week}-${year}-${rows.map((r) => r.id).join(",")}`}
              weekNumber={week}
              year={year}
              initialRows={rows}
              onSaved={refetchWeek}
            />
          )}
        </main>
      </div>
    </HaccpFormGate>
  );
}

export default function IngangscontrolePage() {
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
