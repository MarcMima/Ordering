"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase";
import { HACCP_STORE_ID } from "@/lib/haccp/types";
import { formatWeekYearParam, getISOWeekAndYear, parseWeekYearParam, shiftWeekYear } from "@/lib/haccp/week";

type Card = {
  href: string;
  title: string;
  description: string;
  done: boolean | null;
  disabled?: boolean;
};

function HaccpOverviewContent() {
  const searchParams = useSearchParams();
  const weekParam = searchParams.get("week");
  const parsed = parseWeekYearParam(weekParam);
  const today = new Date();
  const fallback = getISOWeekAndYear(today);
  const week = parsed?.week ?? fallback.week;
  const year = parsed?.year ?? fallback.year;
  const wy = formatWeekYearParam(week, year);
  const prev = shiftWeekYear(week, year, -1);
  const next = shiftWeekYear(week, year, 1);

  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storeId = HACCP_STORE_ID();
    const supabase = createClient();
    const d90 = new Date();
    d90.setDate(d90.getDate() - 90);
    const d90s = d90.toISOString().slice(0, 10);

    void (async () => {
      try {
        const [
          tempRes,
          ingRes,
          schoonRes,
          thermRes,
        ] = await Promise.all([
          supabase
            .from("haccp_temperaturen")
            .select("paraaf")
            .eq("store_id", storeId)
            .eq("week_number", week)
            .eq("year", year)
            .maybeSingle(),
          supabase
            .from("haccp_ingangscontrole")
            .select("id", { count: "exact", head: true })
            .eq("store_id", storeId)
            .eq("week_number", week)
            .eq("year", year),
          supabase
            .from("haccp_schoonmaak")
            .select("uitgevoerd_door")
            .eq("store_id", storeId)
            .eq("week_number", week)
            .eq("year", year)
            .maybeSingle(),
          supabase
            .from("haccp_thermometers")
            .select("id", { count: "exact", head: true })
            .eq("store_id", storeId)
            .gte("datum", d90s),
        ]);

        if (tempRes.error) throw tempRes.error;
        if (ingRes.error) throw ingRes.error;
        if (schoonRes.error) throw schoonRes.error;
        if (thermRes.error) throw thermRes.error;

        const tempDone = !!(tempRes.data?.paraaf && String(tempRes.data.paraaf).trim().length > 0);
        const ingDone = (ingRes.count ?? 0) > 0;
        const schoonDone = !!(schoonRes.data?.uitgevoerd_door && String(schoonRes.data.uitgevoerd_door).trim().length > 0);
        const thermDone = (thermRes.count ?? 0) > 0;

        setCards([
          {
            href: `/dashboard/haccp/temperaturen?week=${wy}`,
            title: "Temperaturen",
            description: "Koelingen, vriezers, vaatwasser, controles.",
            done: tempDone,
          },
          {
            href: `/dashboard/haccp/ingangscontrole?week=${wy}`,
            title: "Ingangscontrole",
            description: "Per levering regels toevoegen.",
            done: ingDone,
          },
          {
            href: `/dashboard/haccp/bereiden`,
            title: "Bereiden & serveren",
            description: "Nog niet in deze app — volgt.",
            done: null,
            disabled: true,
          },
          {
            href: `/dashboard/haccp/schoonmaak?week=${wy}`,
            title: "Schoonmaak",
            description: "Dagrooster per object.",
            done: schoonDone,
          },
          {
            href: `/dashboard/haccp/thermometers`,
            title: "Thermometer-test",
            description: "Kokend / smeltend (per meting).",
            done: thermDone,
          },
          {
            href: `/dashboard/haccp/leveranciers`,
            title: "Leveranciers",
            description: "Vragenlijst per leverancier — volgt.",
            done: null,
            disabled: true,
          },
        ]);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kon HACCP-status niet laden (tabellen aanwezig?).");
        setCards([]);
      }
    })();
  }, [week, year, wy]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← Dashboard
          </Link>
          <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-600 dark:bg-zinc-800">
            <Link
              href={`/dashboard/haccp?week=${formatWeekYearParam(prev.week, prev.year)}`}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              ← Week
            </Link>
            <span className="px-2 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
              {year} · week {week}
            </span>
            <Link
              href={`/dashboard/haccp?week=${formatWeekYearParam(next.week, next.year)}`}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Week →
            </Link>
          </div>
        </div>

        <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">HACCP</h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Weekoverzicht: open of afgerond (paraaf / uitgevoerd / regels ingevuld).
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            {error}
          </div>
        )}

        <ul className="space-y-3">
          {(cards ?? []).map((c) => (
            <li key={c.href}>
              {c.disabled ? (
                <div className="block rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4 opacity-70 dark:border-zinc-600 dark:bg-zinc-900/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-700 dark:text-zinc-200">{c.title}</p>
                      <p className="mt-1 text-sm text-zinc-500">{c.description}</p>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-400">Binnenkort</span>
                  </div>
                </div>
              ) : (
                <Link
                  href={c.href}
                  className="block rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-700/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">{c.title}</p>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{c.description}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                        c.done === true
                          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                          : c.done === false
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {c.done === true ? "Compleet" : c.done === false ? "Open" : "—"}
                    </span>
                  </div>
                </Link>
              )}
            </li>
          ))}
          {!cards && !error && (
            <li className="text-sm text-zinc-500">Laden…</li>
          )}
        </ul>
      </main>
    </div>
  );
}

export default function HaccpDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 p-8 dark:bg-zinc-900">
          <p className="text-zinc-500">Laden…</p>
        </div>
      }
    >
      <HaccpOverviewContent />
    </Suspense>
  );
}
