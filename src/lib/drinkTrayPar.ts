/**
 * Soft drinks are not in prep recipes — they only appear via explicit tray pars.
 * Stock is counted in bottles (pcs); order suggestion is in trays.
 * When on-hand trays (floor(pcs / trayPcs)) is below minTrays, order minTrays trays.
 *
 * The map below is the default. Per location it is overridden by the raw ingredient's own
 * stock par (stock_par_kind = 'packs'): stock_par_min_packs = trays to keep on hand,
 * stock_par_order_packs = trays to order when below (default: the min, at least 1).
 * A daily-need multiplier has no effect on drinks — there is no recipe need to scale.
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

type DrinkRaw = {
  id: string;
  name?: string | null;
  stocktake_visible?: boolean | null;
  stock_par_kind?: "base" | "packs" | null;
  stock_par_min_packs?: number | null;
  stock_par_order_packs?: number | null;
};

function onHandTrays(stockPcs: number, trayPcs: number): number {
  if (trayPcs <= 0) return 0;
  return Math.floor(stockPcs / trayPcs);
}

function normDrinkName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
}

/** Effective tray rule for a drink: hardcoded default, overridden by the DB par of this location's row. */
export function drinkTrayRuleFor(
  ing: DrinkRaw
): { trayPcs: number; minTrays: number; orderTrays: number } | null {
  const base = DRINK_TRAY_PAR_BY_RAW_NAME[normDrinkName(ing.name)];
  if (!base) return null;
  const dbMin = ing.stock_par_kind === "packs" ? ing.stock_par_min_packs : null;
  if (dbMin == null || !Number.isFinite(dbMin) || dbMin < 0) {
    return { trayPcs: base.trayPcs, minTrays: base.minTrays, orderTrays: base.minTrays };
  }
  const dbOrder = ing.stock_par_order_packs;
  const orderTrays =
    dbOrder != null && Number.isFinite(dbOrder) && dbOrder > 0
      ? Math.ceil(dbOrder)
      : Math.max(1, Math.ceil(dbMin));
  return { trayPcs: base.trayPcs, minTrays: dbMin, orderTrays };
}

/** Ensure drink lines exist in base units (bottles) when below tray par — no pack metadata required. */
export function applyDrinkTrayParToBaseSuggested(params: {
  rawIngredients: DrinkRaw[];
  currentRawStock: Record<string, number>;
  baseSuggested: Record<string, number>;
}): Record<string, number> {
  const out = { ...params.baseSuggested };
  for (const ing of params.rawIngredients) {
    if (ing.stocktake_visible === false) continue;
    const rule = drinkTrayRuleFor(ing);
    if (!rule) continue;
    const stock = params.currentRawStock[ing.id] ?? 0;
    if (onHandTrays(stock, rule.trayPcs) >= rule.minTrays) {
      delete out[ing.id];
      continue;
    }
    // The tray rule decides the quantity; a shortfall computed by the generic par is ignored.
    out[ing.id] = rule.orderTrays * rule.trayPcs;
  }
  return out;
}

/** After pack conversion: force the tray count on the order when below par. */
export function applyDrinkTrayStandingPacks(params: {
  rawIngredients: DrinkRaw[];
  currentRawStock: Record<string, number>;
  suggestedPacks: Record<string, number>;
  kindByRaw: Record<string, string>;
}): { suggestedPacks: Record<string, number>; kindByRaw: Record<string, string> } {
  const out = { ...params.suggestedPacks };
  const kindOut = { ...params.kindByRaw };
  for (const ing of params.rawIngredients) {
    if (ing.stocktake_visible === false) continue;
    const rule = drinkTrayRuleFor(ing);
    if (!rule) continue;
    const stock = params.currentRawStock[ing.id] ?? 0;
    if (onHandTrays(stock, rule.trayPcs) >= rule.minTrays) {
      delete out[ing.id];
      delete kindOut[ing.id];
      continue;
    }
    out[ing.id] = rule.orderTrays;
    kindOut[ing.id] = "pack";
  }
  return { suggestedPacks: out, kindByRaw: kindOut };
}
