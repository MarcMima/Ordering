import { getPrepPriority, type PrepPriority } from "@/lib/calculations";

function normName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim().replace(/\s+/g, " ");
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
 * Prep-list visibility on top of stock-% priority.
 * Nothing to make = not on the list (kitchen feedback 17-09: "Make 0 mint = don't make
 * mint"); such items can still be added for today via Edit → Add task. Until 17-09,
 * low-container toppings (isLowContainerPrepItem) and medi salad were shown with
 * Make 0 when only one container was left; that rule is gone.
 */
export function resolvePrepListPriority(params: {
  prepName: string;
  currentStock: number;
  needed: number;
  toMake: number;
  prepTimeHours: number | null;
}): PrepPriority {
  const { currentStock, needed, toMake, prepTimeHours } = params;
  if (!(toMake > 0)) return "hidden";
  const priority = getPrepPriority({ currentStock, needed, prepTimeHours });
  return priority === "hidden" ? 3 : priority;
}
