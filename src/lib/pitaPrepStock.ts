/** Finished prep + frozen raw boxes are interchangeable (50 pcs per box). */
export const PITA_PIECES_PER_BOX = 50;

export const REGULAR_PITA_PREP_NAME = "regular pita with za'atar";
export const WHOLEWHEAT_PITA_PREP_NAME = "wholewheat pita with za'atar";
export const PITA_BREAD_RAW_NAME = "pita bread 15 cm";
export const WHOLEWHEAT_PITA_RAW_NAME = "whole wheat pita bread 15 cm";

function normName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
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

export function pitaRawBoxesFromStockCount(stockCount: number): number {
  return Math.max(0, Number(stockCount) || 0);
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
    if (isRegularPitaPrepName(name)) regularPrepBoxes += qty;
    if (isWholewheatPitaPrepName(name)) wholewheatPrepBoxes += qty;
  }
  let regularRawBoxes = 0;
  let wholewheatRawBoxes = 0;
  for (const ing of params.rawIngredients) {
    const qty = params.rawStockByRawId[ing.id] ?? 0;
    if (isPitaBreadRawName(ing.name)) regularRawBoxes = qty;
    if (isWholewheatPitaRawName(ing.name)) wholewheatRawBoxes = qty;
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
    pitaRawBoxesFromStockCount(params.regularPrepBoxes) +
    pitaRawBoxesFromStockCount(params.wholewheatPrepBoxes) +
    pitaRawBoxesFromStockCount(params.regularRawBoxes) +
    pitaRawBoxesFromStockCount(params.wholewheatRawBoxes)
  );
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
    pitaRawBoxesFromStockCount(params.regularPrepBoxes) +
    pitaRawBoxesFromStockCount(params.wholewheatPrepBoxes);
  const totalRaw =
    pitaRawBoxesFromStockCount(params.regularRawBoxes) +
    pitaRawBoxesFromStockCount(params.wholewheatRawBoxes);
  const finishedShortfall = Math.max(0, totalNeeded - totalFinished);
  return Math.max(0, totalRaw - finishedShortfall);
}

/** Reduce raw pita order need by combined finished + frozen stock (all pita types). */
export function applyCombinedPitaStockCredit(params: {
  baseSuggested: Record<string, number>;
  rawIngredients: { id: string; name?: string | null }[];
  regularPrepBoxes: number;
  wholewheatPrepBoxes: number;
  regularRawBoxes: number;
  wholewheatRawBoxes: number;
}): Record<string, number> {
  const out = { ...params.baseSuggested };
  const poolPieces =
    combinedPitaStockBoxes({
      regularPrepBoxes: params.regularPrepBoxes,
      wholewheatPrepBoxes: params.wholewheatPrepBoxes,
      regularRawBoxes: params.regularRawBoxes,
      wholewheatRawBoxes: params.wholewheatRawBoxes,
    }) * PITA_PIECES_PER_BOX;
  if (poolPieces <= 0) return out;

  const regularRawId = params.rawIngredients.find((r) => isPitaBreadRawName(r.name))?.id;
  const wholeRawId = params.rawIngredients.find((r) => isWholewheatPitaRawName(r.name))?.id;
  const regularNeed = regularRawId ? (out[regularRawId] ?? 0) : 0;
  const wholeNeed = wholeRawId ? (out[wholeRawId] ?? 0) : 0;
  const totalNeed = regularNeed + wholeNeed;
  if (totalNeed <= 0) return out;

  const remaining = Math.max(0, totalNeed - poolPieces);
  if (remaining === 0) {
    if (regularRawId) delete out[regularRawId];
    if (wholeRawId) delete out[wholeRawId];
    return out;
  }

  if (regularRawId) {
    const regularRemaining = Math.min(regularNeed, remaining);
    if (regularRemaining <= 0) delete out[regularRawId];
    else out[regularRawId] = regularRemaining;
  }
  const afterRegular = remaining - Math.min(regularNeed, remaining);
  if (wholeRawId) {
    if (afterRegular <= 0) delete out[wholeRawId];
    else out[wholeRawId] = Math.min(wholeNeed, afterRegular);
  }
  return out;
}
