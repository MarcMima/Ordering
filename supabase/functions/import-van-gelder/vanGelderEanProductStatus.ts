/**
 * ProductStatus per EAN: alle varianten onder een artikelnummer ophalen,
 * daarna matchen op de bestel-EAN (niet de eerste API-regel).
 */

import { vanGelderFetch } from "./vanGelderClient.ts";
import {
  parseVanGelderArticles,
  type ParsedVanGelderArticle,
} from "./vanGelderArticleStatus.ts";
import { normalizeVanGelderEan } from "./vanGelderPrices.ts";

export type VanGelderEanStatusEntry = {
  ean: string;
  productStatus: string;
  name: string | null;
  unit: string | null;
  articleId: string;
};

/** Alleen `available` mag mee in VG-order (inactive/unavailable → skip). */
export function isVanGelderEanDispatchAllowed(
  productStatus: string | null | undefined
): boolean {
  const s = (productStatus ?? "").trim().toLowerCase();
  if (!s) return true;
  return s === "available";
}

export function vanGelderSkipReasonForStatus(
  productStatus: string | null | undefined
): string | null {
  const s = (productStatus ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "inactive") return "ProductStatus inactive";
  if (s === "unavailable") return "ProductStatus unavailable";
  if (s !== "available") return `ProductStatus ${s}`;
  return null;
}

async function fetchArticleVariants(articleId: string): Promise<ParsedVanGelderArticle[]> {
  const path = `/api/articles/1.0/${encodeURIComponent(articleId)}`;
  const response = await vanGelderFetch("articles", path, { method: "GET" });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Van Gelder articles ${articleId} ${response.status}: ${text.slice(0, 300)}`);
  }
  let data: unknown = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Van Gelder articles ${articleId}: ongeldige JSON`);
  }
  return parseVanGelderArticles(data);
}

/** Bouw EAN → ProductStatus index voor een set artikelnummers (parallel, gecached per run). */
export async function buildVanGelderEanProductStatusIndex(
  articleIds: Iterable<string>
): Promise<Map<string, VanGelderEanStatusEntry>> {
  const unique = [...new Set([...articleIds].map((a) => a.trim()).filter(Boolean))];
  const byEan = new Map<string, VanGelderEanStatusEntry>();

  await Promise.all(
    unique.map(async (articleId) => {
      try {
        const variants = await fetchArticleVariants(articleId);
        for (const v of variants) {
          const ean = normalizeVanGelderEan(v.ean);
          if (!ean || byEan.has(ean)) continue;
          byEan.set(ean, {
            ean,
            productStatus: (v.productStatus ?? "").trim(),
            name: v.name,
            unit: v.unit,
            articleId,
          });
        }
      } catch {
        /* per-artikel fout: andere artikelen blijven werken */
      }
    })
  );

  return byEan;
}

export function lookupVanGelderEanStatus(
  ean: string | null | undefined,
  index: Map<string, VanGelderEanStatusEntry>
): VanGelderEanStatusEntry | null {
  const n = normalizeVanGelderEan(ean);
  return n ? index.get(n) ?? null : null;
}
