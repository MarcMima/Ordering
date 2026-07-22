import type { IngredientPackSize, RawIngredient } from "@/lib/types";
import { packSizeToBaseAmount } from "@/lib/stocktakeRawPackMath";
import { isRawVisibleOnStocktake } from "@/lib/stocktakeVisibility";

export type StockParRule =
  | { kind: "base"; minAmount: number }
  | { kind: "packs"; minPacks: number; /** Supplier MOQ: when par triggers, order this many packs (not just shortfall). */ orderPacks?: number };

/**
 * Target on-hand stock (base units or pack counts).
 * Par-managed items order **only** up to this level — cover-window bulk is not added on top.
 */
export const MIN_STOCK_PAR_BY_RAW_NAME: Record<string, StockParRule> = {
  /** Max 11 kg on hand (10 kg case + 1 kg buffer). */
  "all purpose flour": { kind: "base", minAmount: 11000 },
  /** 1 can = 1 kg; reorder below 0.5 can (500 g). */
  "baking powder": { kind: "base", minAmount: 500 },
  "baking soda": { kind: "packs", minPacks: 1 },
  tahini: { kind: "packs", minPacks: 2, orderPacks: 12 },
  "aubergine puree": { kind: "packs", minPacks: 2 },
  "eggplant puree": { kind: "packs", minPacks: 2 },
  /** 1 case = 12 L (12 × 1 L bottles). */
  "lemon juice": { kind: "base", minAmount: 12000 },
  "kalamata olives": { kind: "base", minAmount: 2600 },
  "middle eastern pickles": { kind: "packs", minPacks: 2 },
  /** 6 × 600 g bags. */
  "sugar brown": { kind: "base", minAmount: 3600 },
  /** 1 case = 10 × 1 kg bags. */
  "sugar white": { kind: "base", minAmount: 10000 },
  /** 1 box = 6 emmers (order_pack_multiple on Greek yoghurt). */
  "greek yoghurt 10%": { kind: "packs", minPacks: 1 },
  "vanilla extract": { kind: "packs", minPacks: 1 },
  "whole wheat pita bread 15 cm": { kind: "base", minAmount: 150 },
  "garbage bags blue 145l (roll 20)": { kind: "packs", minPacks: 1 },
  "soof mint": { kind: "packs", minPacks: 1 },
  "soof cardamom": { kind: "packs", minPacks: 1 },
  mint: { kind: "packs", minPacks: 1 },
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

/**
 * Par-managed items: suppress when effective stock (raw + finished prep credit) is at par;
 * otherwise order only the shortfall to par — never stack cover-window bulk on top.
 */
export function applyStockParToBaseSuggested(params: {
  rawIngredients: RawIngredient[];
  currentRawStock: Record<string, number>;
  prepStockCreditByRawId?: Record<string, number>;
  baseSuggested: Record<string, number>;
  orderPackByRawId: Record<string, IngredientPackSize | null>;
}): Record<string, number> {
  const { rawIngredients, currentRawStock, prepStockCreditByRawId, baseSuggested, orderPackByRawId } =
    params;
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
    const stock = (currentRawStock[ing.id] ?? 0) + (prepStockCreditByRawId?.[ing.id] ?? 0);
    if (stock >= minBase) {
      delete out[ing.id];
      continue;
    }
    let orderBase = minBase - stock;
    if (rule.kind === "packs" && rule.orderPacks != null) {
      const pack = orderPackByRawId[ing.id];
      if (pack) {
        const basePerPack = packSizeToBaseAmount(pack, ing.unit ?? "");
        if (basePerPack != null && basePerPack > 0) {
          orderBase = rule.orderPacks * basePerPack;
        }
      }
    }
    out[ing.id] = orderBase;
  }
  return out;
}
