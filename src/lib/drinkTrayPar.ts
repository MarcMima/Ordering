/**
 * Soft drinks are not in prep recipes — they only appear via explicit tray pars.
 * Stock is counted in bottles (pcs); order suggestion is in trays.
 * When on-hand trays (floor(pcs / trayPcs)) is below minTrays, order minTrays trays.
 */
export const DRINK_TRAY_PAR_BY_RAW_NAME: Record<
  string,
  { trayPcs: number; /** Minimum full trays on hand before suppressing the order line. */ minTrays: number }
> = {
  "coca cola zero": { trayPcs: 24, minTrays: 2 },
  "coca cola": { trayPcs: 24, minTrays: 2 },
  "sparkling water": { trayPcs: 18, minTrays: 2 },
  "still water": { trayPcs: 18, minTrays: 2 },
  "charlie's orange mandarin": { trayPcs: 12, minTrays: 1 },
  "charlie's grapefruit": { trayPcs: 12, minTrays: 1 },
};

function onHandTrays(stockPcs: number, trayPcs: number): number {
  if (trayPcs <= 0) return 0;
  return Math.floor(stockPcs / trayPcs);
}

function normDrinkName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
}

/** Ensure drink lines exist in base units (bottles) when below tray par — no pack metadata required. */
export function applyDrinkTrayParToBaseSuggested(params: {
  rawIngredients: { id: string; name?: string | null; stocktake_visible?: boolean | null }[];
  currentRawStock: Record<string, number>;
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  const out = { ...params.baseSuggested };
  for (const ing of params.rawIngredients) {
    if (ing.stocktake_visible === false) continue;
    const rule = DRINK_TRAY_PAR_BY_RAW_NAME[normDrinkName(ing.name)];
    if (!rule) continue;
    const stock = params.currentRawStock[ing.id] ?? 0;
    if (onHandTrays(stock, rule.trayPcs) >= rule.minTrays) {
      delete out[ing.id];
      continue;
    }
    out[ing.id] = Math.max(out[ing.id] ?? 0, rule.minTrays * rule.trayPcs);
  }
  return out;
}

/** After pack conversion: force at least 1 tray on the order when below par. */
export function applyDrinkTrayStandingPacks(params: {
  rawIngredients: { id: string; name?: string | null; stocktake_visible?: boolean | null }[];
  currentRawStock: Record<string, number>;
  suggestedPacks: Record<string, number>;
  kindByRaw: Record<string, string>;
}): { suggestedPacks: Record<string, number>; kindByRaw: Record<string, string> } {
  const out = { ...params.suggestedPacks };
  const kindOut = { ...params.kindByRaw };
  for (const ing of params.rawIngredients) {
    if (ing.stocktake_visible === false) continue;
    const rule = DRINK_TRAY_PAR_BY_RAW_NAME[normDrinkName(ing.name)];
    if (!rule) continue;
    const stock = params.currentRawStock[ing.id] ?? 0;
    if (onHandTrays(stock, rule.trayPcs) >= rule.minTrays) {
      delete out[ing.id];
      delete kindOut[ing.id];
      continue;
    }
    out[ing.id] = Math.max(out[ing.id] ?? 0, rule.minTrays);
    kindOut[ing.id] = "pack";
  }
  return { suggestedPacks: out, kindByRaw: kindOut };
}
