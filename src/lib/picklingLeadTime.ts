/** Raw ingredients that need ~1 day pickling before use (Pickled onion / Pickled cabbage). */
export const PICKLING_LEAD_TIME_DAYS = 1;

export const PICKLING_RAW_NAMES = new Set([
  "red onion sliced fine",
  "red cabbage shredded",
]);

export function isPicklingRawName(name: string | null | undefined): boolean {
  return PICKLING_RAW_NAMES.has((name ?? "").toLowerCase().trim());
}
