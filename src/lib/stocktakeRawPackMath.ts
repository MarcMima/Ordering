import { formatDecimal2 } from "@/lib/format";
import type { IngredientPackSize, RawIngredient } from "@/lib/types";

export function packSizeToBaseAmount(pack: IngredientPackSize, rawUnit: string): number | null {
  const sz = typeof pack.size === "string" ? parseFloat(pack.size) : Number(pack.size);
  if (!Number.isFinite(sz) || sz <= 0) return null;

  const uRaw = (pack.size_unit || "").toLowerCase().trim();
  const u =
    uRaw === "kilogram" || uRaw === "kilograms"
      ? "kg"
      : uRaw === "gram" || uRaw === "grams" || uRaw === "gr"
        ? "g"
        : uRaw === "liter" || uRaw === "liters" || uRaw === "litre" || uRaw === "litres"
          ? "l"
          : uRaw === "milliliter" || uRaw === "milliliters" || uRaw === "millilitre"
            ? "ml"
            : uRaw;

  const ru = (rawUnit || "").toLowerCase().trim();
  const gpgNum =
    pack.grams_per_piece == null
      ? NaN
      : typeof pack.grams_per_piece === "string"
        ? parseFloat(pack.grams_per_piece)
        : Number(pack.grams_per_piece);

  if (ru === "g" && (u === "pcs" || u === "piece" || u === "pieces")) {
    if (Number.isFinite(gpgNum) && gpgNum > 0) return gpgNum * sz;
  }
  if (ru === "g") {
    if (u === "g") return sz;
    if (u === "kg") return sz * 1000;
  }
  if (ru === "ml") {
    if (u === "ml") return sz;
    if (u === "l") return sz * 1000;
  }
  if (ru === "kg" || ru === "kilogram" || ru === "kilograms") {
    if (u === "kg") return sz;
    if (u === "g") return sz / 1000;
  }
  if (ru === "l" || ru === "liter" || ru === "litre") {
    if (u === "l" || u === "liter" || u === "litre") return sz;
    if (u === "ml") return sz / 1000;
  }
  if (ru === "pcs") {
    if (u === "pcs" || u === "piece" || u === "pieces") return sz;
  }
  return null;
}

export function baseAmountFromRawMaster(ing: RawIngredient): number | null {
  const lbl = ing.stocktake_unit_label?.trim();
  const amt = ing.stocktake_content_amount;
  const u = ing.stocktake_content_unit?.trim();
  if (!lbl || amt == null || !u) return null;
  const sz = typeof amt === "string" ? parseFloat(amt) : Number(amt);
  if (!Number.isFinite(sz) || sz <= 0) return null;
  const mirror: IngredientPackSize = {
    id: "_mirror",
    raw_ingredient_id: ing.id,
    size: sz,
    size_unit: u,
  };
  return packSizeToBaseAmount(mirror, ing.unit);
}

export function packsForStocktake(packs: IngredientPackSize[]): IngredientPackSize[] {
  return packs.filter((p) => {
    const pr = (p.pack_purpose || "both").toLowerCase();
    return pr === "stocktake" || pr === "both";
  });
}

export function getDefaultPack(
  ing: RawIngredient,
  packs: IngredientPackSize[]
): { pack: IngredientPackSize; baseAmount: number } | null {
  const list = packsForStocktake(packs);
  if (list.length === 0) return null;
  const candidates = list
    .map((p) => {
      const baseAmount = packSizeToBaseAmount(p, ing.unit);
      return baseAmount != null ? { pack: p, baseAmount } : null;
    })
    .filter(Boolean) as { pack: IngredientPackSize; baseAmount: number }[];
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.baseAmount - a.baseAmount);
  return candidates[0]!;
}

export function rawUnitLower(ing: RawIngredient): string {
  return (ing.unit || "").toLowerCase().trim();
}

/**
 * Base quantity (same unit as `daily_stock_counts` / recipes) that corresponds to entering "1"
 * in the stocktake field. Matches {@link StocktakeRawRow} resolution order.
 */
export function basePerOneStocktakeInputUnit(
  ing: RawIngredient,
  packs: IngredientPackSize[]
): number | null {
  const ru = rawUnitLower(ing);
  const packListSt = packsForStocktake(packs);
  const boxForGram = getGramStockBoxPack(ing, packListSt);
  const countGramsAsBoxes = ru === "g" && boxForGram != null;
  if (countGramsAsBoxes && boxForGram) return boxForGram.baseAmount;

  const masterBase = baseAmountFromRawMaster(ing);
  const countWithMaster = !countGramsAsBoxes && masterBase != null && masterBase > 0;
  if (countWithMaster && masterBase != null) return masterBase;

  const defPack = getDefaultPack(ing, packs);
  const countWithDefPack =
    !countGramsAsBoxes && !countWithMaster && defPack != null && defPack.baseAmount > 0;
  if (countWithDefPack && defPack) return defPack.baseAmount;

  return null;
}

/** Short label for one stocktake input unit (for ordering UI when colli is missing). */
export function stocktakeOrderUnitLabel(ing: RawIngredient, packs: IngredientPackSize[]): string {
  const ru = rawUnitLower(ing);
  const packListSt = packsForStocktake(packs);
  const boxForGram = getGramStockBoxPack(ing, packListSt);
  const countGramsAsBoxes = ru === "g" && boxForGram != null;
  if (countGramsAsBoxes && boxForGram) {
    const gpg =
      boxForGram.pack.grams_per_piece ?? boxForGram.baseAmount / (Number(boxForGram.pack.size) || 1);
    const gpgStr = Number.isFinite(gpg) ? formatDecimal2(Number(gpg)) : "?";
    return `box (~${gpgStr} g)`;
  }

  const masterBase = baseAmountFromRawMaster(ing);
  const countWithMaster = !countGramsAsBoxes && masterBase != null && masterBase > 0;
  if (countWithMaster && ing.stocktake_unit_label?.trim()) {
    const amt = ing.stocktake_content_amount;
    const u = ing.stocktake_content_unit;
    const amtStr =
      amt != null && Number.isFinite(Number(amt)) ? formatDecimal2(Number(amt)) : String(amt ?? "");
    return `${ing.stocktake_unit_label.trim()}${amt != null && u ? ` (${amtStr} ${u})` : ""}`;
  }

  const defPack = getDefaultPack(ing, packs);
  const countWithDefPack =
    !countGramsAsBoxes && !countWithMaster && defPack != null && defPack.baseAmount > 0;
  if (countWithDefPack && defPack) {
    const sz = Number(defPack.pack.size);
    const sizeStr = Number.isFinite(sz) ? formatDecimal2(sz) : String(defPack.pack.size);
    const lbl = defPack.pack.display_unit_label?.trim();
    return lbl
      ? `${lbl}: ${sizeStr} ${defPack.pack.size_unit}`
      : `${sizeStr} ${defPack.pack.size_unit}`;
  }

  return (ing.unit || "unit").trim() || "unit";
}

export function getGramStockBoxPack(
  ing: RawIngredient,
  list: IngredientPackSize[]
): { pack: IngredientPackSize; baseAmount: number } | null {
  if (rawUnitLower(ing) !== "g") return null;
  const candidates = (list ?? [])
    .map((p) => {
      const base = packSizeToBaseAmount(p, ing.unit);
      const u = (p.size_unit || "").toLowerCase().trim();
      const gpg = p.grams_per_piece;
      if (base == null || base <= 0) return null;
      if (!(u === "pcs" || u === "piece" || u === "pieces")) return null;
      if (gpg == null || gpg <= 0) return null;
      return { pack: p, baseAmount: base };
    })
    .filter(Boolean) as { pack: IngredientPackSize; baseAmount: number }[];
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.baseAmount - b.baseAmount);
  return candidates[0]!;
}
