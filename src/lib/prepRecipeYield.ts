import type { PrepItem } from "@/lib/types";

/** One prep count unit → net weight in grams (for solids) or ml (treated as numeric demand for liquids). */
export function nominalContentGrams(p: Pick<PrepItem, "content_amount" | "content_unit">): number | null {
  const amt = p.content_amount;
  const u = (p.content_unit || "").toLowerCase().trim();
  if (amt == null || !Number.isFinite(Number(amt)) || Number(amt) <= 0) return null;
  const n = Number(amt);
  if (u === "g") return n;
  if (u === "kg") return n * 1000;
  if (u === "ml") return n;
  if (u === "l" || u === "liter" || u === "litre") return n * 1000;
  if (u === "pcs" || u === "piece" || u === "pieces") return n;
  return null;
}

/**
 * Actual recipe batch output in the same base as {@link nominalContentGrams}
 * (g for weight, ml for volume when recipe unit is ml/L).
 */
type PrepYieldInput = Pick<
  PrepItem,
  | "content_amount"
  | "content_unit"
  | "recipe_output_amount"
  | "recipe_output_unit"
>;

export function recipeOutputToBaseAmount(p: PrepYieldInput): number | null {
  const amt = p.recipe_output_amount;
  const u = (p.recipe_output_unit || "").toLowerCase().trim();
  if (amt == null || !Number.isFinite(Number(amt)) || Number(amt) <= 0) return null;
  const n = Number(amt);

  if (u === "g") return n;
  if (u === "kg") return n * 1000;
  if (u === "ml") return n;
  if (u === "l" || u === "liter" || u === "litre") return n * 1000;
  if (u === "pcs" || u === "piece" || u === "pieces") return n;
  if (u === "bottle" || u === "bottles") {
    const per = nominalContentGrams(p);
    if (per == null) return null;
    return n * per;
  }
  return null;
}

export type PrepItemYieldMeta = {
  nominalG: number | null;
  recipeG: number | null;
  ingredientQtyPerRecipeBatch: boolean;
};

export function buildYieldMetaForPrepItem(
  p: PrepYieldInput & Pick<PrepItem, "ingredient_qty_is_per_recipe_batch">
): PrepItemYieldMeta {
  return {
    nominalG: nominalContentGrams(p),
    recipeG: recipeOutputToBaseAmount(p),
    ingredientQtyPerRecipeBatch: p.ingredient_qty_is_per_recipe_batch === true,
  };
}
