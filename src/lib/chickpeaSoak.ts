import type { PrepItem } from "@/lib/types";
import { buildYieldMetaForPrepItem } from "@/lib/prepRecipeYield";

/** Soaked chickpea weight (recipe) → approximate dry weight before soaking (~2.15× swell). */
const SOAKED_TO_DRY_FACTOR = 1 / 2.15;

export function roundDryChickpeasKgUpTo5(soakedGrams: number): number {
  if (!Number.isFinite(soakedGrams) || soakedGrams <= 0) return 0;
  const dryKg = (soakedGrams * SOAKED_TO_DRY_FACTOR) / 1000;
  return Math.ceil(dryKg / 5) * 5;
}

type PrepForChickpea = Pick<
  PrepItem,
  | "name"
  | "content_amount"
  | "content_unit"
  | "recipe_output_amount"
  | "recipe_output_unit"
  | "ingredient_qty_is_per_recipe_batch"
>;

/**
 * Grams of soaked chickpeas implied by prep to-make (book quantities in prep_item_ingredients,
 * scaled when ingredient_qty_is_per_recipe_batch).
 */
export function soakedChickpeasGramsForPrepProduct(toMake: number, item: PrepForChickpea): number {
  if (toMake <= 0) return 0;
  const n = (item.name || "").toLowerCase().trim();
  let qtyPerCountUnit: number | null = null;
  if (n === "falafel") qtyPerCountUnit = 5700;
  else if (n === "hummus") qtyPerCountUnit = 4000;
  else return 0;

  const meta = buildYieldMetaForPrepItem(item);
  let factor = 1;
  if (
    meta.ingredientQtyPerRecipeBatch &&
    meta.nominalG != null &&
    meta.recipeG != null &&
    meta.recipeG > 0
  ) {
    factor = meta.nominalG / meta.recipeG;
  }
  return toMake * qtyPerCountUnit * factor;
}
