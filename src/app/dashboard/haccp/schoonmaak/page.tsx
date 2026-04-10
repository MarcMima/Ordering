"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { HaccpPageHeader } from "@/components/haccp/HaccpPageHeader";
import { SchoonmaakForm } from "@/components/haccp/SchoonmaakForm";
import { createClient } from "@/lib/supabase";
import type { HaccpSchoonmaakRow } from "@/lib/haccp/types";
import { HACCP_STORE_ID } from "@/lib/haccp/types";
import { getISOWeekAndYear, parseWeekYearParam } from "@/lib/haccp/week";

function Inner() {
  const searchParams = useSearchParams();
  const parsed = parseWeekYearParam(searchParams.get("week"));
  const fb = getISOWeekAndYear(new Date());
  const week = parsed?.week ?? fb.week;
  const year = parsed?.year ?? fb.year;
  const [row, setRow] = useState<Partial<HaccpSchoonmaakRow> | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const storeId = HACCP_STORE_ID();
    const supabase = createClient();
    void (async () => {
      const { data, error } = await supabase
        .from("haccp_schoonmaak")
        .select("*")
        .eq("store_id", storeId)
        .eq("week_number", week)
        .eq("year", year)
        .maybeSingle();
      if (error) setErr(error.message);
      setRow(data as Partial<HaccpSchoonmaakRow> | null);
    })();
  }, [week, year]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6">
        <HaccpPageHeader title="Schoonmaak" week={week} year={year} basePath="/dashboard/haccp/schoonmaak" />
        {err && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {err}
          </div>
        )}
        {row === undefined ? (
          <p className="text-zinc-500">Laden…</p>
        ) : (
          <SchoonmaakForm key={`${week}-${year}`} weekNumber={week} year={year} initial={row} />
        )}
      </main>
    </div>
  );
}

export default function SchoonmaakPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 p-8 dark:bg-zinc-900">
          <p className="text-zinc-500">Laden…</p>
        </div>
      }
    >
      <Inner />
    </Suspense>
  );
}
