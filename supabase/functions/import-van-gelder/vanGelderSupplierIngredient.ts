/**
 * Van Gelder order/sync: alleen EAN (+ naam/verpakking voor weergave).
 * Artikelnummer (supplier_article_code) wordt niet gebruikt.
 */

export function isVanGelderSupplierName(name: string | null | undefined): boolean {
  return (name ?? "").toLowerCase().includes("van gelder");
}

function normalizeEanDigits(v: string | null | undefined): string | null {
  let d = (v ?? "").trim().replace(/\D/g, "");
  if (d.length === 12) d = `0${d}`;
  return /^\d{13,14}$/.test(d) ? d : null;
}

/** EAN uit supplier_sku als dat een GTIN is (geen 6-cijferig Bidfood-artikelnummer). */
function eanFromSupplierSku(sku: string | null | undefined): string | null {
  const d = (sku ?? "").trim().replace(/\D/g, "");
  if (d.length === 12) return `0${d}`;
  if (/^\d{13,14}$/.test(d)) return d;
  return null;
}

export type VanGelderIngredientRow = {
  raw_ingredient_id: string;
  supplier_sku?: string | null;
  ean_code?: string | null;
  supplier_article_name?: string | null;
  order_unit?: string | null;
  order_unit_size?: number | string | null;
  vg_last_status?: string | null;
};

export type VanGelderMergedIngredient = {
  ean_code: string;
  supplier_article_code: null;
  supplier_article_name: string | null;
  order_unit: string | null;
  order_unit_size: number | null;
  vg_last_status: string | null;
};

export function mergeVanGelderSupplierIngredient(
  row: VanGelderIngredientRow
): VanGelderMergedIngredient | null {
  const ean =
    normalizeEanDigits(row.ean_code ?? null) ?? eanFromSupplierSku(row.supplier_sku ?? null);
  if (!ean) return null;

  let orderUnitSize: number | null = null;
  if (row.order_unit_size != null) {
    const n =
      typeof row.order_unit_size === "string"
        ? parseFloat(row.order_unit_size)
        : Number(row.order_unit_size);
    if (Number.isFinite(n)) orderUnitSize = n;
  }

  return {
    ean_code: ean,
    supplier_article_code: null,
    supplier_article_name: row.supplier_article_name?.trim() || null,
    order_unit: row.order_unit?.trim().toUpperCase() || null,
    order_unit_size: orderUnitSize,
    vg_last_status: row.vg_last_status?.trim() || null,
  };
}
