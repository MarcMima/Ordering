import type { PrepItem, RawIngredient } from "@/lib/types";

function normName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
}

export function isPrepVisibleOnStocktake(prep: PrepItem | null | undefined): boolean {
  if (!prep) return false;
  return prep.stocktake_visible !== false;
}

export function isRawVisibleOnStocktake(ing: RawIngredient): boolean {
  return ing.stocktake_visible !== false;
}

/** West: parboiled rice is ordered via production gate, not weekly stocktake. */
export function isRawVisibleOnStocktakeForLocation(
  ing: RawIngredient,
  locationId?: string | null
): boolean {
  if (
    locationId === "ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a" &&
    normName(ing.name) === "rice parboiled"
  ) {
    return false;
  }
  return isRawVisibleOnStocktake(ing);
}
