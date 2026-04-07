import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns the revenue target for `date` (in cents). If there is no row for that day,
 * copies the most recent target from an **earlier** date for the same location and
 * upserts it for `date`, so the value persists until the user changes it.
 */
export async function ensureEffectiveDailyRevenueTargetCents(
  supabase: SupabaseClient,
  locationId: string,
  date: string
): Promise<number | null> {
  const { data: exact, error: exactErr } = await supabase
    .from("daily_revenue_targets")
    .select("target_amount_cents")
    .eq("location_id", locationId)
    .eq("date", date)
    .maybeSingle();

  if (exactErr) return null;

  if (exact && typeof (exact as { target_amount_cents: number }).target_amount_cents === "number") {
    return (exact as { target_amount_cents: number }).target_amount_cents;
  }

  const { data: priorRows, error: priorErr } = await supabase
    .from("daily_revenue_targets")
    .select("target_amount_cents")
    .eq("location_id", locationId)
    .lt("date", date)
    .order("date", { ascending: false })
    .limit(1);

  if (priorErr || !priorRows?.length) return null;

  const prior = priorRows[0] as { target_amount_cents: number };
  if (typeof prior.target_amount_cents !== "number") return null;

  const cents = prior.target_amount_cents;
  const { error: upErr } = await supabase.from("daily_revenue_targets").upsert(
    { location_id: locationId, date, target_amount_cents: cents },
    { onConflict: "location_id,date" }
  );
  if (upErr) {
    console.error("ensureEffectiveDailyRevenueTargetCents upsert:", upErr.message);
  }
  return cents;
}
