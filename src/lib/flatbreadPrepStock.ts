/** Frozen flatbreads (Java) + defrosted prep stock are one pool for ordering. */
export const FROZEN_FLATBREAD_RAW_NAME = "frozen flatbreads";
export const DEFROSTED_FLATBREAD_PREP_NAME = "defrosted flatbread";

export const FLATBREAD_GRAMS_PER_PIECE = 70;
export const FLATBREAD_PIECES_PER_BAG = 5;

function normName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function isFrozenFlatbreadRawName(name: string | null | undefined): boolean {
  return normName(name) === FROZEN_FLATBREAD_RAW_NAME;
}

export function isDefrostedFlatbreadPrepName(name: string | null | undefined): boolean {
  return normName(name) === DEFROSTED_FLATBREAD_PREP_NAME;
}

/** Prep stocktake count → grams (bags of 5 × 70 g, or total g when count is large). */
export function defrostedFlatbreadPrepCountToGrams(
  prepCount: number,
  piecesPerBag: number = FLATBREAD_PIECES_PER_BAG
): number {
  const n = Math.max(0, Number(prepCount) || 0);
  if (n <= 0) return 0;
  // Large values: kitchen entered total grams on the prep line.
  if (n >= 500) return n;
  const pcsPerBag =
    Number.isFinite(piecesPerBag) && piecesPerBag > 0 ? piecesPerBag : FLATBREAD_PIECES_PER_BAG;
  return n * pcsPerBag * FLATBREAD_GRAMS_PER_PIECE;
}

/** Finished defrosted flatbread reduces Frozen flatbreads order need (base grams). */
export function computeDefrostedFlatbreadRawCredit(params: {
  prepItemsById: Record<
    string,
    { name?: string | null; content_amount?: number | string | null; content_unit?: string | null } | null | undefined
  >;
  prepStockByPrepItemId: Record<string, number>;
  rawIngredients: { id: string; name?: string | null }[];
}): Record<string, number> {
  const frozenRawId = params.rawIngredients.find((r) => isFrozenFlatbreadRawName(r.name))?.id;
  if (!frozenRawId) return {};

  let totalGrams = 0;
  for (const [prepItemId, qty] of Object.entries(params.prepStockByPrepItemId)) {
    const prep = params.prepItemsById[prepItemId];
    if (!isDefrostedFlatbreadPrepName(prep?.name)) continue;
    const pcsPerBag = Number(prep?.content_amount);
    const unit = (prep?.content_unit ?? "").toLowerCase().trim();
    const piecesPerBag =
      unit === "pcs" && Number.isFinite(pcsPerBag) && pcsPerBag > 0 ? pcsPerBag : FLATBREAD_PIECES_PER_BAG;
    totalGrams += defrostedFlatbreadPrepCountToGrams(qty, piecesPerBag);
  }

  if (totalGrams <= 0) return {};
  return { [frozenRawId]: totalGrams };
}
