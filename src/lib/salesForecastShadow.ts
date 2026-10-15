import type { SupabaseClient } from "@supabase/supabase-js";
import { computeOrderSuggestion, type OrderSuggestionSnapshotLine } from "@/lib/orderSuggestion";
import type {
  Supplier,
  RawIngredient,
  IngredientPackSize,
  RawIngredientLocationOrdering,
} from "@/lib/types";
import type { DeliverySchedule } from "@/lib/orderSuggestion";

/** How far ahead the forecast is fetched; wider than any order cover window. */
const FORECAST_DAYS_AHEAD = 10;

export type ShadowRevenueByDate = Record<
  string,
  { forecast_cents: number; baseline_cents: number; promo_channels: string[] }
>;

export type ForecastShadow = {
  lines: OrderSuggestionSnapshotLine[];
  /** Per date the forecast used, plus `_target_cents`: the revenue target of the snapshot date. */
  revenue: Record<string, ShadowRevenueByDate[string] | number | null>;
};

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/**
 * Shadow run of the order suggestion: identical engine, but the revenue target is
 * replaced by the Butlaroo-based forecast (fn_revenue_forecast, migration 253), incl.
 * planned and running Uber Eats / Thuisbezorgd promotions.
 *
 * Never shown to managers and never written anywhere except the snapshot row. Returns
 * null when there is no forecast (no sales history yet) or anything fails: the shadow
 * must never get in the way of the real suggestion.
 */
export async function computeForecastShadow(params: {
  supabase: SupabaseClient;
  locationId: string;
  date: string;
  rawIngredients: RawIngredient[];
  schedules: DeliverySchedule[];
  packSizes: IngredientPackSize[];
  suppliers: Supplier[];
  locationOrderingByRawId: Record<string, RawIngredientLocationOrdering>;
  targetCents: number | null;
}): Promise<ForecastShadow | null> {
  try {
    const { supabase, locationId, date, targetCents, ...config } = params;
    const { data, error } = await supabase.rpc("fn_revenue_forecast", {
      p_location: locationId,
      p_from: date,
      p_to: addDays(date, FORECAST_DAYS_AHEAD),
      p_as_of: date,
    });
    if (error || !Array.isArray(data) || data.length === 0) return null;

    const revenue: ShadowRevenueByDate = {};
    const override: Record<string, number> = {};
    for (const row of data as {
      date: string;
      forecast_cents: number;
      baseline_cents: number;
      promo_channels: string[] | null;
    }[]) {
      const cents = Number(row.forecast_cents) || 0;
      revenue[row.date] = {
        forecast_cents: cents,
        baseline_cents: Number(row.baseline_cents) || 0,
        promo_channels: row.promo_channels ?? [],
      };
      override[row.date] = cents;
    }
    if (!Object.values(override).some((c) => c > 0)) return null;

    const result = await computeOrderSuggestion({
      supabase,
      locationId,
      date,
      ...config,
      revenueOverrideCentsByDate: override,
    });
    if (!result.ok) return null;
    return { lines: result.snapshotLines, revenue: { ...revenue, _target_cents: targetCents } };
  } catch {
    return null;
  }
}
