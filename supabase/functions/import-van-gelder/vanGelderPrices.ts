/** Van Gelder Prices API — actieve EANs (Key) uit prijslijst. */

import { vanGelderFetch } from "./vanGelderClient.ts";

export function normalizeVanGelderEan(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  let s = String(v).replace(/\D/g, "");
  if (s.length === 12) s = `0${s}`;
  return s.length === 13 || s.length === 14 ? s : null;
}

/** EANs with at least one active price line (onlyactiveprices=true). */
export async function fetchVanGelderActivePriceEans(): Promise<Set<string>> {
  const response = await vanGelderFetch(
    "prices",
    "/api/prices/1.0/all?onlyactiveprices=true",
    { method: "GET" }
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Van Gelder prices ${response.status}: ${text.slice(0, 500)}`);
  }
  let data: unknown = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Van Gelder prices: ongeldige JSON");
  }

  const eans = new Set<string>();
  const groups = (data as { Price?: Array<{ Lines?: Array<{ Active?: boolean; Key?: string }> }> })
    .Price;
  if (!Array.isArray(groups)) return eans;

  for (const group of groups) {
    for (const line of group.Lines ?? []) {
      if (line.Active === false) continue;
      const ean = normalizeVanGelderEan(line.Key);
      if (ean) eans.add(ean);
    }
  }
  return eans;
}

export function isEanOnActivePriceList(
  ean: string | null | undefined,
  activeEans: Set<string>
): boolean {
  const n = normalizeVanGelderEan(ean);
  return Boolean(n && activeEans.has(n));
}
