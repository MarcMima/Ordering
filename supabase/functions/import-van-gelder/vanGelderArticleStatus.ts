/**
 * Van Gelder Articles API: ProductStatus per EAN-variant.
 * Dispatch/sync: alleen `available` mag mee (zie isVanGelderEanDispatchAllowed).
 */

export type ParsedVanGelderArticle = {
  id: string | null;
  name: string | null;
  ean: string | null;
  unit: string | null;
  units: number | null;
  productStatus: string | null;
};

export function parseVanGelderArticles(data: unknown): ParsedVanGelderArticle[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const list = Array.isArray(root.Article)
    ? root.Article
    : Array.isArray(root.article)
      ? root.article
      : [];
  const out: ParsedVanGelderArticle[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id =
      typeof row.Id === "string"
        ? row.Id.trim()
        : typeof row.id === "string"
          ? row.id.trim()
          : null;
    const name =
      typeof row.Name === "string"
        ? row.Name.trim()
        : typeof row.name === "string"
          ? row.name.trim()
          : null;
    const eanRaw = row.EAN ?? row.ean ?? row.SecondaryEAN ?? row.secondaryEan;
    const ean =
      typeof eanRaw === "string"
        ? eanRaw.trim()
        : typeof eanRaw === "number"
          ? String(eanRaw)
          : null;
    const unit =
      typeof row.UnitOfMeasurement === "string"
        ? row.UnitOfMeasurement.trim()
        : typeof row.unitOfMeasurement === "string"
          ? row.unitOfMeasurement.trim()
          : null;
    const unitsRaw = row.Units ?? row.units;
    const units =
      typeof unitsRaw === "number"
        ? unitsRaw
        : typeof unitsRaw === "string"
          ? Number.parseFloat(unitsRaw)
          : null;
    const productStatus =
      typeof row.ProductStatus === "string"
        ? row.ProductStatus.trim()
        : typeof row.productStatus === "string"
          ? row.productStatus.trim()
          : null;
    out.push({
      id,
      name,
      ean,
      unit,
      units: Number.isFinite(Number(units)) ? Number(units) : null,
      productStatus,
    });
  }
  return out;
}

/** @deprecated Gebruik isVanGelderEanDispatchAllowed uit vanGelderEanProductStatus.ts */
export function isVanGelderArticleOrderable(
  productStatus: string | null | undefined
): boolean {
  const s = (productStatus ?? "").trim().toLowerCase();
  if (!s) return true;
  return s === "available";
}
