// supabase/functions/price-change-report/index.ts
//
// Monthly price report for Marc: what moved last month across all suppliers,
// how that compares to the 12-week average, and what it did to dish food cost.
//
// Triggered by pg_cron on the 1st of the month; can also be called by hand.
// Auth: shared token, SHA-256 hash in public.integration_tokens under the name
// 'monthly_price_report' (same pattern as bidfood-gmail-sync).
//
// Body (all optional):
//   { from: "2026-08-01", to: "2026-08-31", send_report: true, snapshot: true }
// Defaults to the previous calendar month. send_report=false returns the text
// in the response instead of mailing it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-api-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function euro(cents: number): string {
  return `EUR ${(cents / 100).toFixed(2)}`;
}

function previousMonth(today: Date): { from: string; to: string; label: string } {
  const firstOfThis = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lastOfPrev = new Date(firstOfThis.getTime() - 24 * 3600 * 1000);
  const firstOfPrev = new Date(Date.UTC(lastOfPrev.getUTCFullYear(), lastOfPrev.getUTCMonth(), 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const label = firstOfPrev.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { from: iso(firstOfPrev), to: iso(lastOfPrev), label };
}

type TrendRow = {
  ingredient_name: string;
  supplier_name: string | null;
  effective_date: string;
  price_cents: number;
  prev_price_cents: number | null;
  price_change_pct: number | null;
  pack_size_grams: number | string | null;
  source: string | null;
};

type StatRow = {
  ingredient_name: string;
  supplier_name: string | null;
  current_price_cents: number;
  current_cents_per_kg: number | null;
  avg_cents_per_kg_12w: number | null;
  pct_vs_avg_12w: number | null;
  points_52w: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const token = req.headers.get("x-api-token") ?? "";
    const { data: tokenRow } = await supabase
      .from("integration_tokens")
      .select("token_hash")
      .eq("name", "monthly_price_report")
      .maybeSingle();
    if (!tokenRow?.token_hash) return json({ error: "Integration token not configured" }, 500);
    if (!token || (await sha256Hex(token)) !== tokenRow.token_hash) {
      return json({ error: "Invalid token" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as {
      from?: string;
      to?: string;
      send_report?: boolean;
      snapshot?: boolean;
    };

    const today = new Date();
    const window = previousMonth(today);
    const from = body.from ?? window.from;
    const to = body.to ?? window.to;
    const sendReport = body.send_report ?? true;
    const doSnapshot = body.snapshot ?? true;

    // 1. Fresh food-cost snapshot for today, so next month has a baseline.
    let snapshotRows = 0;
    if (doSnapshot) {
      const { data: n } = await supabase.rpc("snapshot_food_costs");
      snapshotRows = Number(n ?? 0);
    }

    // 2. Price changes inside the window (all suppliers, manual entries included).
    const { data: trend, error: trendErr } = await supabase
      .from("ingredient_price_trend")
      .select("ingredient_name, supplier_name, effective_date, price_cents, prev_price_cents, price_change_pct, pack_size_grams, source")
      .gte("effective_date", from)
      .lte("effective_date", to)
      .not("prev_price_cents", "is", null);
    if (trendErr) throw new Error(`price trend: ${trendErr.message}`);

    // The same supplier exists once per location, so an identical change shows up
    // several times. Collapse those into one line.
    const changeMap = new Map<string, TrendRow & { locations: number }>();
    for (const r of (trend ?? []) as TrendRow[]) {
      const key = `${r.ingredient_name}|${r.supplier_name}|${r.effective_date}|${r.price_cents}|${r.prev_price_cents}`;
      const hit = changeMap.get(key);
      if (hit) hit.locations++;
      else changeMap.set(key, { ...r, locations: 1 });
    }
    const changes = Array.from(changeMap.values()).sort(
      (a, b) => Math.abs(Number(b.price_change_pct ?? 0)) - Math.abs(Number(a.price_change_pct ?? 0))
    );

    // 3. Current price vs 12-week average (unique per ingredient + supplier name).
    const { data: stats } = await supabase
      .from("ingredient_price_stats")
      .select("ingredient_name, supplier_name, current_price_cents, current_cents_per_kg, avg_cents_per_kg_12w, pct_vs_avg_12w, points_52w");
    const statMap = new Map<string, StatRow>();
    for (const s of (stats ?? []) as StatRow[]) {
      statMap.set(`${s.ingredient_name}|${s.supplier_name}`, s);
    }
    const aboveAverage = Array.from(statMap.values())
      .filter((s) => s.points_52w >= 3 && s.pct_vs_avg_12w !== null)
      .sort((a, b) => Math.abs(Number(b.pct_vs_avg_12w)) - Math.abs(Number(a.pct_vs_avg_12w)))
      .slice(0, 10);

    // 4. Food-cost impact: today's snapshot vs the newest one at least 20 days old.
    const { data: snapDates } = await supabase
      .from("food_cost_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false });
    const dates = Array.from(new Set((snapDates ?? []).map((d: { snapshot_date: string }) => d.snapshot_date)));
    const todayIso = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const baselineDate = dates.find((d) => d <= cutoff) ?? null;
    const currentDate = dates.find((d) => d <= todayIso) ?? null;

    type Snap = { menu_item_id: string; cost_cents: number; food_cost_pct: number | null };
    const loadSnapshot = async (date: string) => {
      const { data } = await supabase
        .from("food_cost_snapshots")
        .select("menu_item_id, cost_cents, food_cost_pct")
        .eq("snapshot_date", date);
      const m = new Map<string, Snap>();
      for (const r of (data ?? []) as Snap[]) m.set(r.menu_item_id, r);
      return m;
    };

    let dishLines: string[] = [];
    if (baselineDate && currentDate && baselineDate !== currentDate) {
      const [now, before] = await Promise.all([loadSnapshot(currentDate), loadSnapshot(baselineDate)]);
      const { data: items } = await supabase.from("menu_items").select("id, name");
      const nameOf = new Map((items ?? []).map((i: { id: string; name: string }) => [i.id, i.name]));

      const moves: { name: string; oldC: number; newC: number; pct: number }[] = [];
      for (const [id, cur] of now) {
        const prev = before.get(id);
        if (!prev || !prev.cost_cents) continue;
        const oldC = Number(prev.cost_cents);
        const newC = Number(cur.cost_cents);
        if (Math.round(oldC) === Math.round(newC)) continue;
        moves.push({ name: nameOf.get(id) ?? id, oldC, newC, pct: ((newC - oldC) / oldC) * 100 });
      }
      moves.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
      dishLines = moves
        .slice(0, 15)
        .map((m) => `- ${m.name}: ${euro(m.oldC)} -> ${euro(m.newC)} (${m.pct > 0 ? "+" : ""}${m.pct.toFixed(1)}%)`);
      if (moves.length === 0) dishLines = ["- No dish cost changed by a full cent."];
      dishLines.unshift(`Comparing ${baselineDate} with ${currentDate}:`);
    } else {
      dishLines = [
        "No earlier food-cost snapshot to compare against yet — today's snapshot is the baseline for next month's report.",
      ];
    }

    // ── Build the mail ──────────────────────────────────────────────────────
    const risers = changes.filter((c) => Number(c.price_change_pct ?? 0) > 0);
    const fallers = changes.filter((c) => Number(c.price_change_pct ?? 0) < 0);
    const lines: string[] = [
      `Mima price report — ${from} to ${to}`,
      "",
      `Price changes recorded: ${changes.length} (${risers.length} up, ${fallers.length} down)`,
      `Food-cost snapshot written for ${snapshotRows} dishes`,
      "",
    ];

    const fmtChange = (c: TrendRow & { locations: number }) => {
      const pct = Number(c.price_change_pct ?? 0);
      return `- ${c.ingredient_name} (${c.supplier_name ?? "no supplier"}): ${euro(
        Number(c.prev_price_cents)
      )} -> ${euro(Number(c.price_cents))} (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%) on ${c.effective_date}`;
    };

    if (risers.length > 0) {
      lines.push("Biggest increases:");
      risers.slice(0, 15).forEach((c) => lines.push(fmtChange(c)));
      lines.push("");
    }
    if (fallers.length > 0) {
      lines.push("Biggest decreases:");
      fallers.slice(0, 15).forEach((c) => lines.push(fmtChange(c)));
      lines.push("");
    }
    if (changes.length === 0) {
      lines.push("No price changes were recorded in this period.", "");
    }

    if (aboveAverage.length > 0) {
      lines.push("Furthest from their 12-week average (per kg):");
      for (const s of aboveAverage) {
        const pct = Number(s.pct_vs_avg_12w);
        lines.push(
          `- ${s.ingredient_name} (${s.supplier_name ?? "no supplier"}): now ${euro(
            Number(s.current_cents_per_kg)
          )}/kg vs ${euro(Number(s.avg_cents_per_kg_12w))}/kg average (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)`
        );
      }
      lines.push("");
    }

    lines.push("Effect on dish food cost:");
    lines.push(...dishLines);
    lines.push("");
    lines.push("Prices come from ingredient_prices (weekly Bidfood sync + manual entries).");

    const text = lines.join("\n");
    const subject = `Mima price report ${from.slice(0, 7)} — ${changes.length} price changes`;

    let mailError: string | null = null;
    if (sendReport) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("FROM_EMAIL") ?? "ordering@mimafood.nl";
      const to_ = (Deno.env.get("BIDFOOD_SYNC_REPORT_TO") ?? "marc@mimafood.nl")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!resendKey) mailError = "RESEND_API_KEY missing";
      else {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({ from: fromEmail, to: to_, subject, text }),
        });
        if (!resp.ok) mailError = `Resend error: ${await resp.text()}`;
      }
    }

    return json({
      ok: !mailError,
      from,
      to,
      changes: changes.length,
      snapshot_rows: snapshotRows,
      baseline_snapshot: baselineDate,
      mail: sendReport ? mailError ?? "sent" : "not sent",
      text: sendReport ? undefined : text,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return json({ error: "price-change-report failed", detail }, 500);
  }
});
