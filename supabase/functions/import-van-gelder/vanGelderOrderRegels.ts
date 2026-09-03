/** Van Gelder orderregels: expand app quantity → EAN + Aantal (eventueel meerdere regels). */

export type VanGelderOrderRegel = { ean: string; aantal: number };

/** Rode ui fijn 1 kg — kist 12 + losse zak (zelfde artikel 106649). */
export const RED_ONION_VG_CRATE_EAN = "8713507249699";
export const RED_ONION_VG_LOOSE_EAN = "8713507249705";
export const RED_ONION_VG_CRATE_BAGS = 12;

export const PARSLEY_VG_BOX_4KG_EAN = "8713507265965";
export const PARSLEY_VG_BAG_1KG_EAN = "8713507199536";

export function isRedOnionSlicedFineRawName(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === "red onion sliced fine";
}

export function isParsleyRawName(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === "parsley";
}

/** 4 kg box (142088) vs 1 kg bag (142077). */
export function parsleyVanGelderEanForPack(
  packSize: number | null | undefined,
  packSizeUnit: string | null | undefined
): string {
  const sz = Number(packSize);
  const u = (packSizeUnit ?? "").toLowerCase().trim();
  if (Number.isFinite(sz) && sz === 4 && u === "kg") return PARSLEY_VG_BOX_4KG_EAN;
  return PARSLEY_VG_BAG_1KG_EAN;
}

/** App order quantity is already in VG order units (crates), not sub-units inside a crate. */
export function isVanGelderQtyAlreadyInOrderUnits(rawName: string | null | undefined): boolean {
  const n = (rawName ?? "").trim().toLowerCase();
  return n === "aubergine" || n === "chickpeas" || n === "romaine lettuce";
}

/**
 * Convert app line quantity to 1 kg bag count.
 * Pack is now a 3 kg colli (`case (3 × 1 kg)`): qty 1 → 3 bags.
 * Legacy 1 kg bag lines (size 1 kg) stay 1:1.
 */
export function redOnionBagQtyFromOrderLine(line: {
  quantity: number;
  pack_size?: { size?: number | null; size_unit?: string | null } | null;
}): number {
  const qty = Math.max(0, Math.ceil(Number(line.quantity) || 0));
  if (qty <= 0) return 0;
  const sz = Number(line.pack_size?.size);
  const u = (line.pack_size?.size_unit ?? "").toLowerCase().trim();
  if (Number.isFinite(sz) && sz > 0 && (u === "kg" || u === "kilogram")) {
    return Math.max(1, Math.ceil(qty * sz));
  }
  return qty;
}

/** `bagQty` = aantal 1 kg-zakken uit de app. */
export function expandRedOnionBagQty(
  bagQty: number,
  looseEanOk: boolean
): VanGelderOrderRegel[] {
  const qty = Math.max(0, Math.ceil(bagQty));
  if (qty <= 0) return [];

  const crates = Math.floor(qty / RED_ONION_VG_CRATE_BAGS);
  const loose = qty % RED_ONION_VG_CRATE_BAGS;
  const out: VanGelderOrderRegel[] = [];

  if (crates > 0) {
    out.push({ ean: RED_ONION_VG_CRATE_EAN, aantal: crates });
  }
  if (loose > 0) {
    if (looseEanOk) {
      out.push({ ean: RED_ONION_VG_LOOSE_EAN, aantal: loose });
    } else {
      out.push({ ean: RED_ONION_VG_CRATE_EAN, aantal: 1 });
    }
  }
  return out;
}

export function parseVanGelderOrderUnitDivisor(orderUnit: string | null | undefined): number | null {
  const u = (orderUnit ?? "").toUpperCase().trim();
  if (!u) return null;
  const m = u.match(/(\d+(?:[.,]\d+)?)(ST|KG|G|L|ML|PCS)?$/i);
  if (!m) return null;
  const raw = Number(String(m[1]).replace(",", "."));
  if (!Number.isFinite(raw) || raw <= 1) return null;
  return raw;
}

/** Trailing unit of a VG order unit code, e.g. `KST12ST` → `ST`, `KST3KG` → `KG`. */
export function parseVanGelderOrderUnitSuffix(orderUnit: string | null | undefined): string | null {
  const u = (orderUnit ?? "").toUpperCase().trim();
  if (!u) return null;
  const m = u.match(/\d+(?:[.,]\d+)?(ST|KG|G|L|ML|PCS)$/i);
  return m ? m[1].toUpperCase() : null;
}

type UnitFamily = "mass" | "volume" | "count";

/** Normalize a size to the family's base unit (kg, l, pieces), or null if the unit is unknown. */
function normalizeSize(
  size: number,
  unit: string | null | undefined
): { family: UnitFamily; value: number } | null {
  const u = (unit ?? "").toLowerCase().trim();
  if (u === "kg" || u === "kilogram") return { family: "mass", value: size };
  if (u === "g" || u === "gram") return { family: "mass", value: size / 1000 };
  if (u === "l" || u === "liter" || u === "litre") return { family: "volume", value: size };
  if (u === "ml") return { family: "volume", value: size / 1000 };
  if (u === "st" || u === "stuks" || u === "pcs" || u === "pieces") {
    return { family: "count", value: size };
  }
  return null;
}

/**
 * Does one app pack equal exactly one Van Gelder order unit?
 *
 * The app records order quantities in packs (`ingredient_pack_sizes`), so when the pack IS the
 * VG order unit the quantity must be sent through unchanged. Dividing it again short-ships the
 * store — a crate of 12 cucumbers became `ceil(7 / 12) = 1` crate before this check existed.
 *
 * Comparison is by size, converted to a shared base unit when both units are known and of the
 * same family (500 g vs a 3 KG colli is not a match). When the units are not comparable — a
 * 6 kg pack against a `KST6ST` code, where the `ST` counts 1 kg bags — the magnitudes are
 * compared directly. Anything we cannot line up returns false and keeps the divisor.
 */
export function isPackSameAsVanGelderOrderUnit(params: {
  packSize?: number | null;
  packSizeUnit?: string | null;
  orderUnit?: string | null;
  divisor: number;
}): boolean {
  const packSize = Number(params.packSize);
  if (!Number.isFinite(packSize) || packSize <= 0) return false;
  if (!Number.isFinite(params.divisor) || params.divisor <= 0) return false;

  const pack = normalizeSize(packSize, params.packSizeUnit);
  const orderSuffix = parseVanGelderOrderUnitSuffix(params.orderUnit);
  const order = orderSuffix ? normalizeSize(params.divisor, orderSuffix) : null;

  if (pack && order && pack.family === order.family) {
    return Math.abs(pack.value - order.value) < 1e-9;
  }
  return Math.abs(packSize - params.divisor) < 1e-9;
}

export function vanGelderDispatchQtyForLine(line: {
  quantity: number;
  raw_ingredient?: { name?: string | null };
  pack_size?: { size?: number | null; size_unit?: string | null } | null;
  supplier_ingredient?: {
    order_unit?: string | null;
    order_unit_size?: number | null;
  } | null;
}): number {
  const qty = Math.max(1, Math.ceil(Number(line.quantity) || 0));
  if (isVanGelderQtyAlreadyInOrderUnits(line.raw_ingredient?.name)) return qty;
  const explicitSize = Number(line.supplier_ingredient?.order_unit_size ?? NaN);
  const orderUnit = line.supplier_ingredient?.order_unit ?? null;
  const divisor =
    (Number.isFinite(explicitSize) && explicitSize > 1 ? explicitSize : null) ??
    parseVanGelderOrderUnitDivisor(orderUnit);
  if (!divisor) return qty;
  if (
    isPackSameAsVanGelderOrderUnit({
      packSize: line.pack_size?.size,
      packSizeUnit: line.pack_size?.size_unit,
      orderUnit,
      divisor,
    })
  ) {
    return qty;
  }
  return Math.max(1, Math.ceil(qty / divisor));
}
