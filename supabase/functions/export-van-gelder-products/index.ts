// Bulk-export Van Gelder artikelen (artikelnummer, EAN, naam).
// Draait op Supabase → directe VG API-calls (geen dubbele hop per request).
//
// POST {}  of  { "from": 100000, "to": 200000, "concurrency": 80 }
// Deploy: supabase functions deploy export-van-gelder-products --no-verify-jwt

import { vanGelderApiRoot, vanGelderFetch } from "../import-van-gelder/vanGelderClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ArticleRow = {
  artikelnummer: string;
  ean: string;
  naam: string;
  product_status: string;
  unit_of_measurement: string;
  units: number | string;
};

async function fetchOne(id: number): Promise<ArticleRow | null> {
  const response = await vanGelderFetch(
    "articles",
    `/api/articles/1.0/${id}`,
    { method: "GET" }
  );
  if (response.status !== 200) return null;
  const text = await response.text();
  if (!text) return null;
  let data: { Article?: Array<Record<string, unknown>> };
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const row = data.Article?.[0];
  if (!row) return null;
  return {
    artikelnummer: String(row.Id ?? id),
    ean: String(row.EAN ?? ""),
    naam: String(row.Name ?? ""),
    product_status: String(row.ProductStatus ?? ""),
    unit_of_measurement: String(row.UnitOfMeasurement ?? ""),
    units:
      typeof row.Units === "number" || typeof row.Units === "string"
        ? row.Units
        : "",
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const from = Number(body.from ?? 100_000);
    const to = Number(body.to ?? 200_000);
    const concurrency = Math.min(
      120,
      Math.max(10, Number(body.concurrency ?? 80))
    );

    const ids = Array.from(
      { length: to - from + 1 },
      (_, i) => from + i
    );
    const started = Date.now();

    const results = await mapPool(ids, concurrency, fetchOne);
    const products = results.filter((r): r is ArticleRow => r != null);
    products.sort((a, b) => a.naam.localeCompare(b.naam, "nl"));

    const elapsedSec = Math.round((Date.now() - started) / 1000);

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: ids.length,
        found: products.length,
        elapsed_sec: elapsedSec,
        from,
        to,
        api_root: vanGelderApiRoot(),
        products,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: detail }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
