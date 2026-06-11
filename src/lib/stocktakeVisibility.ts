import type { PrepItem, RawIngredient } from "@/lib/types";

/** Until Bidfood has whole wheat again (migration 144). */
const HIDDEN_PREP_NAME = "wholewheat pita with za'atar";
const HIDDEN_RAW_NAME = "whole wheat pita bread 15 cm";

function normName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
}

export function isPrepVisibleOnStocktake(prep: PrepItem | null | undefined): boolean {
  if (!prep) return false;
  if (normName(prep.name) === HIDDEN_PREP_NAME) return false;
  return prep.stocktake_visible !== false;
}

export function isRawVisibleOnStocktake(ing: RawIngredient): boolean {
  if (normName(ing.name) === HIDDEN_RAW_NAME) return false;
  return ing.stocktake_visible !== false;
}
