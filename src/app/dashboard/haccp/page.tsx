"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";
import type { HaccpWeeklyReading } from "@/lib/haccp/types";
import { getHaccpStoreId } from "@/lib/haccp/types";
import { APP_FORM_KEYS, type AppFormKey } from "@/lib/appFormKeys";
import {
  isThermometerQuietPeriod,
  isThermometerRoutineDone,
  thermometerQuietEndsDate,
} from "@/lib/haccp/thermometerSchedule";
import { isBereidenWeekComplete } from "@/lib/haccp/bereidenComplete";
import { formatWeekYearParam, getISOWeekAndYear, parseWeekYearParam, shiftWeekYear } from "@/lib/haccp/week";
import type { HaccpBereidenRow } from "@/lib/haccp/types";

function parseWeeklyReadings(raw: unknown): HaccpWeeklyReading[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object" && "equipment_id" in x) as HaccpWeeklyReading[];
}

type Card = {
  href: string;
  title: string;
  description: string;
  done: boolean | null;
  disabled?: boolean;
  muted?: boolean;
  formKey?: AppFormKey;
};

function HaccpOverviewContent() {
  const { locations, locationId } = useLocation();
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
    const storeId = getHaccpStoreId(locations, locationId);
    const supabase = createClient();

    void (async () => {
      try {
        const [
          tempRes,
          equipRes,
          ingRes,
          schoonRes,
          bereidenRes,
          latestThermRes,
          formVisRes,
        ] = await Promise.all([
          supabase
            .from("haccp_temperaturen")
            .select("paraaf, weekly_readings")
            .eq("store_id", storeId)
            .eq("week_number", week)
            .eq("year", year)
            .maybeSingle(),
          supabase
            .from("haccp_store_equipment")
            .select("id", { count: "exact", head: true })
            .eq("store_id", storeId),
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
            .from("haccp_bereiden")
            .select("*")
            .eq("store_id", storeId)
            .eq("week_number", week)
            .eq("year", year)
            .maybeSingle(),
          supabase
            .from("haccp_thermometers")
            .select("datum, afwijking, maatregel")
            .eq("store_id", storeId)
            .order("datum", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from("app_form_settings").select("form_key, visible"),
        ]);

        if (tempRes.error) throw tempRes.error;
        if (equipRes.error) throw equipRes.error;
        if (ingRes.error) throw ingRes.error;
        if (schoonRes.error) throw schoonRes.error;
        if (bereidenRes.error) throw bereidenRes.error;
        if (latestThermRes.error) throw latestThermRes.error;

        const equipCount = equipRes.count ?? 0;
        const wr = parseWeeklyReadings(tempRes.data?.weekly_readings);
        const readingsComplete =
          equipCount > 0 &&
          wr.length >= equipCount &&
          wr.every((r) => r.temperature != null && Number.isFinite(Number(r.temperature)));
        const tempDone =
          !!(tempRes.data?.paraaf && String(tempRes.data.paraaf).trim().length > 0) && readingsComplete;
        const ingDone = (ingRes.count ?? 0) > 0;
        const schoonDone = !!(schoonRes.data?.uitgevoerd_door && String(schoonRes.data.uitgevoerd_door).trim().length > 0);
        const bereidenDone = isBereidenWeekComplete(bereidenRes.data as HaccpBereidenRow | null);

        const latestTherm = latestThermRes.data as {
          datum: string;
          afwijking: number | null;
          maatregel: string | null;
        } | null;
        const thermQuiet = isThermometerQuietPeriod(latestTherm);
        const thermDone = isThermometerRoutineDone(latestTherm);

        const visibility: Record<string, boolean> = {};
        if (!formVisRes.error && formVisRes.data) {
          for (const r of formVisRes.data as { form_key: string; visible: boolean }[]) {
            visibility[r.form_key] = r.visible;
          }
        }
        const vis = (key: AppFormKey) => visibility[key] !== false;

        const thermDesc =
          thermQuiet && latestTherm
            ? `Quiet period after a passing test — full prominence again from ${thermometerQuietEndsDate(latestTherm.datum).toLocaleDateString(undefined, { dateStyle: "medium" })}.`
            : "Boiling / melting checks (typically once per quarter).";

        const allCards: Card[] = [
          {
            formKey: APP_FORM_KEYS.haccp_temperatures,
            href: `/dashboard/haccp/temperaturen?week=${wy}`,
            title: "Temperatures",
            description: "Weekly equipment checks (limits per appliance).",
            done: tempDone,
          },
          {
            formKey: APP_FORM_KEYS.haccp_goods_in,
            href: `/dashboard/haccp/ingangscontrole?week=${wy}`,
            title: "Goods in",
            description: "Bidfood & Van Gelder lines per week.",
            done: ingDone,
          },
          {
            formKey: APP_FORM_KEYS.haccp_prepare,
            href: `/dashboard/haccp/bereiden?week=${wy}`,
            title: "Prepare & serve",
            description: "Cooling, core temps, fryer, regenerate, buffet (per registration form).",
            done: bereidenDone,
          },
          {
            formKey: APP_FORM_KEYS.haccp_cleaning,
            href: `/dashboard/haccp/schoonmaak?week=${wy}`,
            title: "Cleaning",
            description: "Daily checklist by area.",
            done: schoonDone,
          },
          {
            formKey: APP_FORM_KEYS.haccp_thermometers,
            href: `/dashboard/haccp/thermometers`,
            title: "Thermometer test",
            description: thermDesc,
            done: thermDone,
            muted: thermQuiet,
          },
          {
            formKey: APP_FORM_KEYS.haccp_suppliers,
            href: `/dashboard/haccp/leveranciers`,
            title: "Suppliers",
            description:
              "Supplier questionnaire table exists; admin-style forms per supplier are not implemented yet.",
            done: null,
            disabled: true,
          },
        ];

        const filtered = allCards.filter((c) => !c.formKey || vis(c.formKey));
        const sorted = [...filtered].sort((a, b) => {
          if (Boolean(a.muted) === Boolean(b.muted)) return 0;
          return a.muted ? 1 : -1;
        });

        setCards(sorted);
        setError(null);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not load HACCP status (check DB migrations and RLS)."
        );
        setCards([]);
      }
    })();
  }, [week, year, wy, locations, locationId]);

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
          Week overview: open or complete (sign-off / completed / lines filled).
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
                    <span className="shrink-0 text-xs text-zinc-400">Soon</span>
                  </div>
                </div>
              ) : (
                <Link
                  href={c.href}
                  className={`block rounded-xl border p-4 transition-colors ${
                    c.muted
                      ? "border-zinc-100 bg-zinc-50/90 opacity-75 hover:border-zinc-200 hover:bg-zinc-100/90 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-700/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className={
                          c.muted
                            ? "text-sm font-medium text-zinc-600 dark:text-zinc-300"
                            : "font-medium text-zinc-900 dark:text-zinc-50"
                        }
                      >
                        {c.title}
                      </p>
                      <p
                        className={
                          c.muted
                            ? "mt-1 text-xs text-zinc-500 dark:text-zinc-500"
                            : "mt-1 text-sm text-zinc-500 dark:text-zinc-400"
                        }
                      >
                        {c.description}
                      </p>
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
                      {c.done === true ? "Done" : c.done === false ? "Open" : "—"}
                    </span>
                  </div>
                </Link>
              )}
            </li>
          ))}
          {!cards && !error && (
            <li className="text-sm text-zinc-500">Loading…</li>
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
          <p className="text-zinc-500">Loading…</p>
        </div>
      }
    >
      <HaccpOverviewContent />
    </Suspense>
  );
}
