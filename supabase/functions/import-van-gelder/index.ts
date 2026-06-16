// Test / probe Van Gelder read APIs (acc of prod via secrets).
// Deploy: supabase functions deploy import-van-gelder
//
// POST body examples:
//   { "api": "customer", "code": "MIMAMS1" }
//   { "api": "articles", "articleId": "12345" }
//   { "api": "prices", "onlyActivePrices": true }
//   { "api": "assortments", "code": "MIMAMS1" }
//   { "api": "assortments", "path": "/api/assortments/1.0/..." }  — handmatig pad uit portal

import {
  vanGelderApiRoot,
  vanGelderFetch,
  vanGelderSubscriptionKey,
} from "./vanGelderClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const api = String(body.api ?? "").toLowerCase();

    if (!api) {
      return json(
        {
          error: "Geef api: customer | articles | prices | assortments",
          configured: {
            orders: Boolean(vanGelderSubscriptionKey("orders")),
            articles: Boolean(vanGelderSubscriptionKey("articles")),
            assortments: Boolean(vanGelderSubscriptionKey("assortments")),
            customer: Boolean(vanGelderSubscriptionKey("customer")),
            prices: Boolean(vanGelderSubscriptionKey("prices")),
          },
          apiRoot: vanGelderApiRoot(),
        },
        400
      );
    }

    let path = "";
    let product: "articles" | "assortments" | "customer" | "prices";

    switch (api) {
      case "customer": {
        product = "customer";
        const code = String(body.code ?? "MIMAMS1").trim();
        path = `/api/customerinformation/1.0/${encodeURIComponent(code)}`;
        break;
      }
      case "articles": {
        product = "articles";
        const customPath = String(body.path ?? "").trim();
        if (customPath) {
          path = customPath.startsWith("/") ? customPath : `/${customPath}`;
          break;
        }
        const search = String(body.search ?? "").trim();
        if (search) {
          const q = encodeURIComponent(search);
          const candidates = [
            `/api/articles/1.0/all?search=${q}`,
            `/api/articles/1.0/all?query=${q}`,
            `/api/articles/1.0/search?query=${q}`,
            `/api/articles/1.0/search/${q}`,
            `/api/articles/1.0?search=${q}`,
          ];
          const attempts: Array<{
            path: string;
            status: number;
            ok: boolean;
            data: unknown;
          }> = [];

          for (const candidate of candidates) {
            const response = await vanGelderFetch(product, candidate, {
              method: "GET",
            });
            const text = await response.text();
            let data: unknown = text;
            try {
              data = JSON.parse(text);
            } catch {
              /* plain text */
            }
            attempts.push({
              path: candidate,
              status: response.status,
              ok: response.ok,
              data,
            });
            if (response.ok) {
              return json({
                ok: true,
                status: response.status,
                url: `${vanGelderApiRoot()}${candidate}`,
                path: candidate,
                data,
              });
            }
          }

          return json({
            ok: false,
            error:
              "Geen artikelen-search pad gevonden. Stuur GET-URL uit developer portal als body.path.",
            search,
            attempts: attempts.map((a) => ({
              path: a.path,
              status: a.status,
              url: `${vanGelderApiRoot()}${a.path}`,
            })),
            last: attempts[attempts.length - 1],
          });
        }
        const articleId = String(body.articleId ?? "").trim();
        if (!articleId) {
          return json({ error: "articles vereist articleId, search of path" }, 400);
        }
        path = `/api/articles/1.0/${encodeURIComponent(articleId)}`;
        break;
      }
      case "prices": {
        product = "prices";
        const onlyActive = body.onlyActivePrices !== false;
        path = `/api/prices/1.0/all?onlyactiveprices=${onlyActive}`;
        break;
      }
      case "assortments": {
        product = "assortments";
        const customPath = String(body.path ?? "").trim();
        if (customPath) {
          path = customPath.startsWith("/") ? customPath : `/${customPath}`;
          break;
        }
        const code = String(body.code ?? "MIMAMS1").trim();
        const enc = encodeURIComponent(code);
        const candidates = [
          `/api/assortments/1.0/${enc}`,
          `/api/assortments/1.0/customer/${enc}`,
          `/api/assortments/1.0/customers/${enc}`,
          `/api/assortments/1.0/all?customercode=${enc}`,
          `/api/assortments/1.0/all?code=${enc}`,
          `/api/assortment/1.0/${enc}`,
        ];
        const attempts: Array<{
          path: string;
          status: number;
          ok: boolean;
          data: unknown;
        }> = [];

        for (const candidate of candidates) {
          const response = await vanGelderFetch(product, candidate, {
            method: "GET",
          });
          const text = await response.text();
          let data: unknown = text;
          try {
            data = JSON.parse(text);
          } catch {
            /* plain text */
          }
          attempts.push({
            path: candidate,
            status: response.status,
            ok: response.ok,
            data,
          });
          if (response.ok) {
            return json({
              ok: true,
              status: response.status,
              url: `${vanGelderApiRoot()}${candidate}`,
              path: candidate,
              data,
            });
          }
        }

        return json({
          ok: false,
          error:
            "Geen assortments-pad gevonden. Stuur GET-URL uit developer portal als body.path.",
          code,
          attempts: attempts.map((a) => ({
            path: a.path,
            status: a.status,
            url: `${vanGelderApiRoot()}${a.path}`,
          })),
          last: attempts[attempts.length - 1],
        });
      }
      default:
        return json({ error: `Onbekende api: ${api}` }, 400);
    }

    const response = await vanGelderFetch(product, path, { method: "GET" });
    const text = await response.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* plain text */
    }

    return json({
      ok: response.ok,
      status: response.status,
      url: `${vanGelderApiRoot()}${path}`,
      data,
      ...(response.ok
        ? {}
        : {
            hint:
              "Van Gelder antwoordde met een fout; controleer status/data (geen 502 meer van deze function).",
          }),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return json({ error: detail }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
