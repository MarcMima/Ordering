import type { PrepItemIngredientRow } from "@/lib/calculations";
import type { RawIngredient } from "@/lib/types";
import type { PrepItemYieldMeta } from "@/lib/prepRecipeYield";

const MEDI_SALAD_PREP_NAME = "mediterranean salad / medi salad";
const MEDI_SALAD_RAW_NAME = "medi salad 3kg";
const MEDI_SALAD_TUB_G = 3000;

/** Pijp + Zuidas: order VG brunoise tub instead of loose cucumber + tomato for medi salad prep. */
export function locationUsesVanGelderMediSaladTub(locationName: string | null | undefined): boolean {
  const n = (locationName ?? "").toLowerCase();
  return n.includes("pijp") || n.includes("zuidas");
}

function normName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
}

function rawIdByName(rawIngredients: RawIngredient[], name: string): string | null {
  const want = normName(name);
  return rawIngredients.find((r) => normName(r.name) === want)?.id ?? null;
}

/** Max suggested order in base units (g/ml/pcs) per delivery. */
export const MAX_ORDER_BASE_BY_RAW_NAME: Record<string, number> = {
  "carrot julienne": 1000,
};

export function applyMediSaladVanGelderOverride(params: {
  locationName: string | null | undefined;
  dailyRawNeed: Record<string, number>;
  neededByPrepItemId: Record<string, number>;
  recipeFiltered: PrepItemIngredientRow[];
  rawIngredients: RawIngredient[];
  prepYieldByPrepItemId: Record<string, PrepItemYieldMeta>;
  mediSaladPrepItemId: string | null;
}): Record<string, number> {
  const {
    locationName,
    dailyRawNeed,
    neededByPrepItemId,
    recipeFiltered,
    rawIngredients,
    prepYieldByPrepItemId,
    mediSaladPrepItemId,
  } = params;
  if (!locationUsesVanGelderMediSaladTub(locationName) || !mediSaladPrepItemId) {
    return dailyRawNeed;
  }

  const needPrep = neededByPrepItemId[mediSaladPrepItemId] ?? 0;
  if (needPrep <= 0) return dailyRawNeed;

  const mediRawId = rawIdByName(rawIngredients, MEDI_SALAD_RAW_NAME);
  if (!mediRawId) return dailyRawNeed;

  const cucumberId = rawIdByName(rawIngredients, "Cucumber");
  const tomatoId = rawIdByName(rawIngredients, "Tomato");
  const out = { ...dailyRawNeed };

  for (const row of recipeFiltered) {
    if (row.prep_item_id !== mediSaladPrepItemId) continue;
    if (row.raw_ingredient_id !== cucumberId && row.raw_ingredient_id !== tomatoId) continue;
    let factor = 1;
    const meta = prepYieldByPrepItemId[row.prep_item_id];
    if (meta?.ingredientQtyPerRecipeBatch) {
      const { nominalG, recipeG } = meta;
      if (
        nominalG != null &&
        recipeG != null &&
        nominalG > 0 &&
        recipeG > 0 &&
        Number.isFinite(nominalG) &&
        Number.isFinite(recipeG)
      ) {
        factor = nominalG / recipeG;
      }
    }
    const fromMedi = needPrep * row.quantity_per_unit * factor;
    out[row.raw_ingredient_id] = Math.max(0, (out[row.raw_ingredient_id] ?? 0) - fromMedi);
  }

  out[mediRawId] = (out[mediRawId] ?? 0) + needPrep * MEDI_SALAD_TUB_G;
  return out;
}

export function applyMaxOrderBaseCaps(params: {
  rawIngredients: RawIngredient[];
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  const { rawIngredients, baseSuggested } = params;
  const out = { ...baseSuggested };
  for (const ing of rawIngredients) {
    const cap = MAX_ORDER_BASE_BY_RAW_NAME[normName(ing.name)];
    if (cap == null) continue;
    const cur = out[ing.id];
    if (cur != null && cur > cap) out[ing.id] = cap;
  }
  return out;
}
