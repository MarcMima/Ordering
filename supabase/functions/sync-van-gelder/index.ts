import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildVanGelderEanProductStatusIndex,
  isVanGelderEanDispatchAllowed,
  lookupVanGelderEanStatus,
} from "../import-van-gelder/vanGelderEanProductStatus.ts";
import { VG_STATUS_ARTICLE_IDS } from "../import-van-gelder/vanGelderMimaEanArticleIndex.ts";
import {
  fetchVanGelderActivePriceEans,
  isEanOnActivePriceList,
  normalizeVanGelderEan,
} from "../import-van-gelder/vanGelderPrices.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SupplierIngredientRow = {
  id: string;
  ean_code: string | null;
  supplier_id: string;
  raw_ingredient: { name: string } | null;
  supplier: { name: string } | null;
  vg_last_checked_at?: string | null;
  vg_is_active?: boolean | null;
  vg_last_status?: string | null;
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      onlySupplierName?: string;
      onlyEan?: string;
      mode?: "full" | "hourly";
      staleAfterHours?: number;
      maxEans?: number;
    };
    const dryRun = body.dryRun !== false;
    const onlySupplierName = (body.onlySupplierName ?? "Van Gelder").trim().toLowerCase();
    const onlyEan = normalizeVanGelderEan(body.onlyEan ?? "");
    const mode = body.mode === "hourly" ? "hourly" : "full";
    const staleAfterHours = Math.max(1, Math.floor(Number(body.staleAfterHours ?? 3)));
    const maxEans =
      body.maxEans != null && Number.isFinite(Number(body.maxEans))
        ? Math.max(1, Math.floor(Number(body.maxEans)))
        : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data, error } = await supabase
      .from("supplier_ingredients")
      .select(`
        id,
        supplier_id,
        ean_code,
        vg_last_checked_at,
        vg_is_active,
        vg_last_status,
        raw_ingredient:raw_ingredients (name),
        supplier:suppliers (name)
      `)
      .not("ean_code", "is", null);

    if (error) return json({ error: error.message }, 500);

    const [activePriceEans, statusIndex] = await Promise.all([
      fetchVanGelderActivePriceEans(),
      buildVanGelderEanProductStatusIndex(VG_STATUS_ARTICLE_IDS),
    ]);

    const nowMs = Date.now();
    const staleMs = staleAfterHours * 60 * 60 * 1000;
    const nowIso = new Date().toISOString();

    const rowsAll = (data ?? []) as SupplierIngredientRow[];
    const rows = rowsAll.filter((r) => {
      const supplierName = (r.supplier?.name ?? "").trim().toLowerCase();
      if (supplierName !== onlySupplierName) return false;
      const ean = normalizeVanGelderEan(r.ean_code);
      if (!ean) return false;
      if (onlyEan && ean !== onlyEan) return false;
      return true;
    });

    const byEan = new Map<string, SupplierIngredientRow[]>();
    for (const row of rows) {
      const ean = normalizeVanGelderEan(row.ean_code)!;
      if (mode === "hourly" && !onlyEan) {
        const checkedMs = row.vg_last_checked_at
          ? new Date(row.vg_last_checked_at).getTime()
          : NaN;
        const neverChecked = !Number.isFinite(checkedMs);
        const stale = neverChecked || nowMs - checkedMs > staleMs;
        const notActive = row.vg_is_active === false;
        const hadError = (row.vg_last_status ?? "").startsWith("error:");
        if (!stale && !notActive && !hadError) continue;
      }
      const list = byEan.get(ean) ?? [];
      list.push(row);
      byEan.set(ean, list);
    }

    let eans = [...byEan.keys()];
    if (mode === "hourly") {
      eans = eans.sort((a, b) => {
        const ra = byEan.get(a)?.[0];
        const rb = byEan.get(b)?.[0];
        const aBad = Number(Boolean(ra?.vg_is_active === false || (ra?.vg_last_status ?? "").startsWith("error:")));
        const bBad = Number(Boolean(rb?.vg_is_active === false || (rb?.vg_last_status ?? "").startsWith("error:")));
        if (aBad !== bBad) return bBad - aBad;
        const at = ra?.vg_last_checked_at ? new Date(ra.vg_last_checked_at).getTime() : 0;
        const bt = rb?.vg_last_checked_at ? new Date(rb.vg_last_checked_at).getTime() : 0;
        return at - bt;
      });
      if (maxEans != null) eans = eans.slice(0, maxEans);
    }

    const updates: Array<{
      id: string;
      vg_is_active: boolean;
      vg_last_status: string;
      vg_last_checked_at: string;
      notes?: string;
    }> = [];

    let dispatchOkCount = 0;
    let missingFromPrices = 0;
    let inactiveCount = 0;
    let unavailableCount = 0;
    let unknownStatusCount = 0;

    for (const ean of eans) {
      const onList = isEanOnActivePriceList(ean, activePriceEans);
      if (!onList) missingFromPrices += 1;

      const entry = lookupVanGelderEanStatus(ean, statusIndex);
      const productStatus = (entry?.productStatus ?? "").trim().toLowerCase();
      if (!productStatus) unknownStatusCount += 1;
      else if (productStatus === "inactive") inactiveCount += 1;
      else if (productStatus === "unavailable") unavailableCount += 1;

      const dispatchOk = onList && isVanGelderEanDispatchAllowed(entry?.productStatus);
      if (dispatchOk) dispatchOkCount += 1;

      const statusLabel = productStatus
        ? productStatus
        : onList
          ? "unknown_product_status"
          : "not_on_price_list";

      for (const row of byEan.get(ean) ?? []) {
        updates.push({
          id: row.id,
          vg_is_active: dispatchOk,
          vg_last_status: statusLabel,
          vg_last_checked_at: nowIso,
          ...(!dispatchOk
            ? {
                notes: `VG sync ${nowIso}: EAN ${ean} prijslijst=${onList ? "ja" : "nee"} status=${statusLabel}`,
              }
            : {}),
        });
      }
    }

    if (!dryRun) {
      for (const u of updates) {
        const { error: upErr } = await supabase
          .from("supplier_ingredients")
          .update(u)
          .eq("id", u.id);
        if (upErr) {
          return json({ error: upErr.message, failedUpdate: u.id }, 500);
        }
      }
    }

    return json({
      ok: true,
      dryRun,
      supplier: onlySupplierName,
      mode,
      check_method: "prices_api_and_product_status_by_ean",
      stale_after_hours: staleAfterHours,
      total_rows_considered: rows.length,
      checked_eans: eans.length,
      dispatch_ok: dispatchOkCount,
      not_on_price_list: missingFromPrices,
      product_status_inactive: inactiveCount,
      product_status_unavailable: unavailableCount,
      product_status_unknown: unknownStatusCount,
      price_list_size: activePriceEans.size,
      status_index_eans: statusIndex.size,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return json({ error: detail }, 500);
  }
});
