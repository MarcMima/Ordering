/** Finished prep + frozen raw boxes are interchangeable (50 pcs per box). */
export const PITA_PIECES_PER_BOX = 50;

export const REGULAR_PITA_PREP_NAME = "regular pita with za'atar";
export const WHOLEWHEAT_PITA_PREP_NAME = "wholewheat pita with za'atar";
export const PITA_BREAD_RAW_NAME = "pita bread 15 cm";
export const WHOLEWHEAT_PITA_RAW_NAME = "whole wheat pita bread 15 cm";

function normName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function isRegularPitaPrepName(name: string | null | undefined): boolean {
  return normName(name) === REGULAR_PITA_PREP_NAME;
}

export function isWholewheatPitaPrepName(name: string | null | undefined): boolean {
  return normName(name) === WHOLEWHEAT_PITA_PREP_NAME;
}

export function isPitaBreadRawName(name: string | null | undefined): boolean {
  return normName(name) === PITA_BREAD_RAW_NAME;
}

export function isWholewheatPitaRawName(name: string | null | undefined): boolean {
  return normName(name) === WHOLEWHEAT_PITA_RAW_NAME;
}

/** Prep stocktake counts are entered in boxes. */
export function pitaPrepBoxesFromStockCount(stockCount: number): number {
  return Math.max(0, Number(stockCount) || 0);
}

/** Raw stocktake counts are stored in base pieces (50 pcs per box). */
export function pitaRawBoxesFromBaseStock(basePieces: number): number {
  const pieces = Math.max(0, Number(basePieces) || 0);
  return pieces / PITA_PIECES_PER_BOX;
}

/** @deprecated Use {@link pitaPrepBoxesFromStockCount} or {@link pitaRawBoxesFromBaseStock}. */
export function pitaRawBoxesFromStockCount(stockCount: number): number {
  return pitaPrepBoxesFromStockCount(stockCount);
}

export function extractPitaStockCounts(params: {
  prepItemsById: Record<string, { name?: string | null } | null | undefined>;
  prepStockByPrepItemId: Record<string, number>;
  rawIngredients: { id: string; name?: string | null }[];
  rawStockByRawId: Record<string, number>;
}): {
  regularPrepBoxes: number;
  wholewheatPrepBoxes: number;
  regularRawBoxes: number;
  wholewheatRawBoxes: number;
} {
  let regularPrepBoxes = 0;
  let wholewheatPrepBoxes = 0;
  for (const [prepItemId, qty] of Object.entries(params.prepStockByPrepItemId)) {
    const name = params.prepItemsById[prepItemId]?.name;
    if (isRegularPitaPrepName(name)) regularPrepBoxes += pitaPrepBoxesFromStockCount(qty);
    if (isWholewheatPitaPrepName(name)) wholewheatPrepBoxes += pitaPrepBoxesFromStockCount(qty);
  }
  let regularRawBoxes = 0;
  let wholewheatRawBoxes = 0;
  for (const ing of params.rawIngredients) {
    const qty = params.rawStockByRawId[ing.id] ?? 0;
    if (isPitaBreadRawName(ing.name)) regularRawBoxes = pitaRawBoxesFromBaseStock(qty);
    if (isWholewheatPitaRawName(ing.name)) wholewheatRawBoxes = pitaRawBoxesFromBaseStock(qty);
  }
  return { regularPrepBoxes, wholewheatPrepBoxes, regularRawBoxes, wholewheatRawBoxes };
}

export function combinedPitaStockBoxes(params: {
  regularPrepBoxes: number;
  wholewheatPrepBoxes: number;
  regularRawBoxes: number;
  wholewheatRawBoxes: number;
}): number {
  return (
    pitaPrepBoxesFromStockCount(params.regularPrepBoxes) +
    pitaPrepBoxesFromStockCount(params.wholewheatPrepBoxes) +
    pitaPrepBoxesFromStockCount(params.regularRawBoxes) +
    pitaPrepBoxesFromStockCount(params.wholewheatRawBoxes)
  );
}

/** Boxes of frozen raw to finish (prep all raw pita boxes; finished prep lives in freezer separately). */
export function calcPitaRawBoxesToPrep(params: {
  rawBoxes: number;
  batchSize: number | null | undefined;
}): number {
  const raw = Math.max(0, pitaPrepBoxesFromStockCount(params.rawBoxes));
  if (raw <= 0) return 0;
  const batch = params.batchSize != null && params.batchSize > 0 ? params.batchSize : 1;
  return Math.ceil(raw / batch) * batch;
}

/** Boxes of frozen raw still needing za'atar / finishing for regular white pita. */
export function calcRegularPitaZaatarToMake(params: {
  neededRegularBoxes: number;
  neededWholewheatBoxes: number;
  regularPrepBoxes: number;
  wholewheatPrepBoxes: number;
  regularRawBoxes: number;
  wholewheatRawBoxes: number;
}): number {
  const totalNeeded =
    Math.max(0, params.neededRegularBoxes) + Math.max(0, params.neededWholewheatBoxes);
  const totalFinished =
    pitaPrepBoxesFromStockCount(params.regularPrepBoxes) +
    pitaPrepBoxesFromStockCount(params.wholewheatPrepBoxes);
  const totalRaw =
    pitaPrepBoxesFromStockCount(params.regularRawBoxes) +
    pitaPrepBoxesFromStockCount(params.wholewheatRawBoxes);
  const finishedShortfall = Math.max(0, totalNeeded - totalFinished);
  return Math.min(totalRaw, finishedShortfall);
}

/**
 * Reduce each pita type's order need by that type's **finished prep** boxes.
 * Frozen raw stock is already subtracted in suggestOrderBaseQuantities
 * (daily_stock_counts); crediting it here again halves the advice.
 */
export function applyCombinedPitaStockCredit(params: {
  baseSuggested: Record<string, number>;
  rawIngredients: { id: string; name?: string | null }[];
  regularPrepBoxes: number;
  wholewheatPrepBoxes: number;
  regularRawBoxes: number;
  wholewheatRawBoxes: number;
}): Record<string, number> {
  const out = { ...params.baseSuggested };
  const regularRawId = params.rawIngredients.find((r) => isPitaBreadRawName(r.name))?.id;
  const wholeRawId = params.rawIngredients.find((r) => isWholewheatPitaRawName(r.name))?.id;

  if (regularRawId) {
    const regularNeed = out[regularRawId] ?? 0;
    if (regularNeed > 0) {
      const poolPieces =
        pitaPrepBoxesFromStockCount(params.regularPrepBoxes) * PITA_PIECES_PER_BOX;
      const remaining = Math.max(0, regularNeed - poolPieces);
      if (remaining <= 0) delete out[regularRawId];
      else out[regularRawId] = remaining;
    }
  }

  if (wholeRawId) {
    const wholeNeed = out[wholeRawId] ?? 0;
    if (wholeNeed > 0) {
      const poolPieces =
        pitaPrepBoxesFromStockCount(params.wholewheatPrepBoxes) * PITA_PIECES_PER_BOX;
      const remaining = Math.max(0, wholeNeed - poolPieces);
      if (remaining <= 0) delete out[wholeRawId];
      else out[wholeRawId] = remaining;
    }
  }

  return out;
}

/**
 * Wholewheat pita: keep at least 1 box (50 pcs) of raw+finished stock;
 * when below, order 1 box (independent of white pita).
 */
export function applyWholewheatPitaMinBox(params: {
  rawIngredients: { id: string; name?: string | null; stocktake_visible?: boolean | null }[];
  baseSuggested: Record<string, number>;
  wholewheatPrepBoxes: number;
  wholewheatRawBoxes: number;
}): Record<string, number> {
  const wholeRawId = params.rawIngredients.find((r) => isWholewheatPitaRawName(r.name))?.id;
  if (!wholeRawId) return params.baseSuggested;
  const ing = params.rawIngredients.find((r) => r.id === wholeRawId);
  if (ing?.stocktake_visible === false) return params.baseSuggested;

  const onHandBoxes =
    pitaPrepBoxesFromStockCount(params.wholewheatPrepBoxes) +
    pitaPrepBoxesFromStockCount(params.wholewheatRawBoxes);
  const out = { ...params.baseSuggested };
  if (onHandBoxes >= 1) {
    // Cover-window may still want more; only clear forced min, keep existing need.
    return out;
  }
  out[wholeRawId] = Math.max(out[wholeRawId] ?? 0, PITA_PIECES_PER_BOX);
  return out;
}
