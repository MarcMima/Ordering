import type { PrepItem } from "@/lib/types";
import {
  calcNeededQuantity,
  calcToMake,
  getPrepPriority,
  type PrepPriority,
} from "@/lib/calculations";
import { roundDryChickpeasKgUpTo5, soakedChickpeasGramsForPrepProduct } from "@/lib/chickpeaSoak";

/** One row from `location_prep_items` with nested `prep_items` (same shape as prep list / ordering soak fetch). */
export type LpiRowForSoak = {
  prep_item_id: string;
  base_quantity?: number | null;
  display_order?: number | null;
  prep_items: PrepItem | null;
};

/**
 * Dry chickpeas to soak (5 kg steps), from the same prep need logic as the prep list
 * (Falafel / Hummus recipe chickpea grams × to-make, then dry rounding).
 */
export function soakDryChickpeasKgFromPrepState(params: {
  locationPrepItems: LpiRowForSoak[];
  todayCounts: Record<string, number>;
  revenueMultiplier: number;
}): number {
  const { locationPrepItems, todayCounts, revenueMultiplier } = params;
  type Internal = { row: LpiRowForSoak; toMake: number; priority: PrepPriority };
  const list: Internal[] = [];
  for (const row of locationPrepItems) {
    const item = row.prep_items;
    if (!item) continue;
    const baseQty = row.base_quantity ?? 1;
    const needed = calcNeededQuantity({ baseQuantity: baseQty, revenueMultiplier });
    const currentStock = todayCounts[row.prep_item_id] ?? 0;
    const toMake = calcToMake({
      needed,
      currentStock,
      batchSize: item.batch_size ?? null,
    });
    let priority = getPrepPriority({
      currentStock,
      needed,
      prepTimeHours: item.prep_time_hours ?? null,
    });
    if (priority === "hidden" && toMake > 0) priority = 3;
    if (priority === "hidden") continue;
    list.push({ row, toMake, priority });
  }
  let soaked = 0;
  for (const { row, toMake } of list) {
    const item = row.prep_items;
    if (!item) continue;
    soaked += soakedChickpeasGramsForPrepProduct(toMake, item);
  }
  return roundDryChickpeasKgUpTo5(soaked);
}
