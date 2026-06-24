import { getPrepPriority, type PrepPriority } from "@/lib/calculations";

function normName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
}

/** GN toppings: flag when only one container left but service still needs prep. */
const LOW_CONTAINER_PREP_SUBSTRINGS = [
  "parsley",
  "mint",
  "pomegranate",
  "shifka",
  "mediterranean pickles",
  "med pickles",
  "feta",
] as const;

export function isLowContainerPrepItem(prepName: string | null | undefined): boolean {
  const n = normName(prepName);
  return LOW_CONTAINER_PREP_SUBSTRINGS.some((s) => n.includes(s));
}

export function isMediSaladPrepItem(prepName: string | null | undefined): boolean {
  const n = normName(prepName);
  return n.includes("mediterranean salad") || n.includes("medi salad");
}

/**
 * Prep-list visibility with kitchen rules on top of stock-% priority.
 * Low-container toppings and medi salad stay visible when stock is tight.
 */
export function resolvePrepListPriority(params: {
  prepName: string;
  currentStock: number;
  needed: number;
  toMake: number;
  prepTimeHours: number | null;
}): PrepPriority {
  const { prepName, currentStock, needed, toMake, prepTimeHours } = params;
  let priority = getPrepPriority({ currentStock, needed, prepTimeHours });
  if (priority === "hidden" && toMake > 0) priority = 3;

  if (priority !== "hidden" || needed <= 0) return priority;

  if (isLowContainerPrepItem(prepName) && currentStock <= 1) {
    return currentStock <= 0 ? 1 : 2;
  }

  if (isMediSaladPrepItem(prepName) && currentStock < needed) {
    return currentStock <= 0 ? 1 : currentStock <= 1 ? 2 : 3;
  }

  return priority;
}
