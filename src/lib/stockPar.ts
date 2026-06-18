import type { IngredientPackSize, RawIngredient } from "@/lib/types";
import { packSizeToBaseAmount } from "@/lib/stocktakeRawPackMath";
import { isRawVisibleOnStocktake } from "@/lib/stocktakeVisibility";

export type StockParRule =
  | { kind: "base"; minAmount: number }
  | { kind: "packs"; minPacks: number; /** Supplier MOQ: when par triggers, order this many packs (not just shortfall). */ orderPacks?: number };

/**
 * Minimum on-hand stock (base units or pack counts). When stocktake count is below par,
 * ordering tops up to the minimum.
 */
export const MIN_STOCK_PAR_BY_RAW_NAME: Record<string, StockParRule> = {
  "all purpose flour": { kind: "packs", minPacks: 4 },
  "baking powder": { kind: "packs", minPacks: 2 },
  "baking soda": { kind: "packs", minPacks: 3 },
  tahini: { kind: "packs", minPacks: 2, orderPacks: 12 },
  "aubergine puree": { kind: "packs", minPacks: 4 },
  "eggplant puree": { kind: "packs", minPacks: 4 },
  "lemon juice": { kind: "packs", minPacks: 12 },
  "kalamata olives": { kind: "base", minAmount: 2600 },
  "middle eastern pickles": { kind: "packs", minPacks: 2 },
  "rice pandan": { kind: "base", minAmount: 4500 },
  "sugar brown": { kind: "packs", minPacks: 6 },
  "vanilla extract": { kind: "packs", minPacks: 1 },
  "whole wheat pita bread 15 cm": { kind: "base", minAmount: 150 },
  "garbage bags blue 145l (roll 20)": { kind: "packs", minPacks: 1 },
  "coca cola": { kind: "packs", minPacks: 2 },
  "coca cola zero": { kind: "packs", minPacks: 2 },
  "still water": { kind: "packs", minPacks: 18 },
  "sparkling water": { kind: "packs", minPacks: 18 },
  "soof mint": { kind: "packs", minPacks: 1 },
  "soof cardamom": { kind: "packs", minPacks: 1 },
  "soof lavender": { kind: "packs", minPacks: 1 },
};

function minBaseAmountForPar(params: {
  ing: RawIngredient;
  rule: StockParRule;
  orderPack: IngredientPackSize | null;
}): number | null {
  const { ing, rule, orderPack } = params;
  if (rule.kind === "base") return rule.minAmount;
  if (!orderPack) return null;
  const basePerPack = packSizeToBaseAmount(orderPack, ing.unit ?? "");
  if (basePerPack == null || basePerPack <= 0) return null;
  return rule.minPacks * basePerPack;
}

/** Top up baseSuggested when counted stock is below configured minimums. */
export function applyStockParToBaseSuggested(params: {
  rawIngredients: RawIngredient[];
  currentRawStock: Record<string, number>;
  baseSuggested: Record<string, number>;
  orderPackByRawId: Record<string, IngredientPackSize | null>;
}): Record<string, number> {
  const { rawIngredients, currentRawStock, baseSuggested, orderPackByRawId } = params;
  const out = { ...baseSuggested };
  for (const ing of rawIngredients) {
    if (!isRawVisibleOnStocktake(ing)) continue;
    const rule = MIN_STOCK_PAR_BY_RAW_NAME[(ing.name ?? "").toLowerCase().trim()];
    if (rule == null) continue;
    const minBase = minBaseAmountForPar({
      ing,
      rule,
      orderPack: orderPackByRawId[ing.id] ?? null,
    });
    if (minBase == null || minBase <= 0) continue;
    const stock = currentRawStock[ing.id] ?? 0;
    if (stock >= minBase) continue;
    let orderBase = minBase - stock;
    if (rule.kind === "packs" && rule.orderPacks != null) {
      const pack = orderPackByRawId[ing.id];
      if (pack) {
        const basePerPack = packSizeToBaseAmount(pack, ing.unit ?? "");
        if (basePerPack != null && basePerPack > 0) {
          // orderPacks is already in physical packs; supplier MOQ rounding happens later via order_pack_multiple.
          orderBase = rule.orderPacks * basePerPack;
        }
      }
    }
    out[ing.id] = Math.max(out[ing.id] ?? 0, orderBase);
  }
  return out;
}
