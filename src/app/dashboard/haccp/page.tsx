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
              "Upload questionnaires, certificates, and other supplier documents (from your Admin supplier list).",
            done: null,
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
    <div className="min-h-screen bg-background font-sans">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-ink-soft/80 hover:text-ink"
          >
            ← Dashboard
          </Link>
          <div className="flex items-center gap-1 card rounded-lg p-1">
            <Link
              href={`/dashboard/haccp?week=${formatWeekYearParam(prev.week, prev.year)}`}
              className="rounded-md px-3 py-1.5 label hover:bg-brand-sand/50"
            >
              ← Week
            </Link>
            <span className="px-2 text-sm tabular-nums text-ink-soft">
              {year} · week {week}
            </span>
            <Link
              href={`/dashboard/haccp?week=${formatWeekYearParam(next.week, next.year)}`}
              className="rounded-md px-3 py-1.5 label hover:bg-brand-sand/50"
            >
              Week →
            </Link>
          </div>
        </div>

        <h1 className="mb-2 page-title">HACCP</h1>
        <p className="mb-6 help-text">
          Week overview: open or complete (sign-off / completed / lines filled).
        </p>

        {error && (
          <div className="mb-4 alert-warning">
            {error}
          </div>
        )}

        <ul className="space-y-3">
          {(cards ?? []).map((c) => (
            <li key={c.href}>
              {c.disabled ? (
                <div className="block rounded-xl border border-dashed border-brand-green/15 bg-background/80 p-4 opacity-70">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink-soft">{c.title}</p>
                      <p className="mt-1 help-text">{c.description}</p>
                    </div>
                    <span className="shrink-0 text-xs text-ink-soft/60">Soon</span>
                  </div>
                </div>
              ) : (
                <Link
                  href={c.href}
                  className={`block rounded-xl border p-4 transition-colors ${ c.muted ? "border-brand-green/10 bg-background/90 opacity-75 hover:border-brand-green/10 hover:bg-brand-sand/50 " : "border-brand-green/10 bg-surface hover:border-brand-green/15 hover:bg-background " }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className={
                          c.muted
                            ? "text-sm font-medium text-ink-soft"
                            : "font-medium text-ink "
                        }
                      >
                        {c.title}
                      </p>
                      <p
                        className={
                          c.muted
                            ? "mt-1 text-xs text-ink-soft/70"
                            : "mt-1 help-text"
                        }
                      >
                        {c.description}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${ c.done === true ? "badge-success" : c.done === false ? "badge-pending" : "bg-brand-sand/50 text-ink-soft" }`}
                    >
                      {c.done === true ? "Done" : c.done === false ? "Open" : "—"}
                    </span>
                  </div>
                </Link>
              )}
            </li>
          ))}
          {!cards && !error && (
            <li className="help-text">Loading…</li>
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
        <div className="min-h-screen bg-background font-sans p-8">
          <p className="text-ink-soft/80">Loading…</p>
        </div>
      }
    >
      <HaccpOverviewContent />
    </Suspense>
  );
}
