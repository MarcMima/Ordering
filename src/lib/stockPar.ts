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
  /** Reorder point: only order when stock dips below 2 kg (then one 10 kg case). */
  "all purpose flour": { kind: "base", minAmount: 2000 },
  /** 1 can = 1 kg; reorder below 0.5 can (500 g). */
  "baking powder": { kind: "base", minAmount: 500 },
  "baking soda": { kind: "packs", minPacks: 1 },
  tahini: { kind: "packs", minPacks: 2, orderPacks: 12 },
  /** Below ~2 cans (2.83 kg each); order rounds up to 1 case of 6. */
  "aubergine puree": { kind: "base", minAmount: 5660 },
  "eggplant puree": { kind: "base", minAmount: 5660 },
  /** 1 case = 12 L (12 × 1 L bottles). */
  "lemon juice": { kind: "base", minAmount: 12000 },
  "kalamata olives": { kind: "base", minAmount: 2600 },
  "middle eastern pickles": { kind: "packs", minPacks: 2 },
  /** 6 × 600 g bags. */
  "sugar brown": { kind: "base", minAmount: 3600 },
  /** Below 5 kg → order 1 case (10 × 1 kg). */
  "sugar white": { kind: "packs", minPacks: 0.5, orderPacks: 1 },
  /** Below 0.5 × 5 L bottle → order 1 bottle. */
  "olive oil": { kind: "packs", minPacks: 0.5, orderPacks: 1 },
  /** Order pack = 1 kg bucket (Bidfood EM); keep 1 case = 6 buckets on hand. */
  "greek yoghurt 10%": { kind: "packs", minPacks: 6 },
  "vanilla extract": { kind: "packs", minPacks: 1 },
  "garbage bags blue 145l (roll 20)": { kind: "packs", minPacks: 1 },
  "soof mint": { kind: "packs", minPacks: 1 },
  "soof cardamom": { kind: "packs", minPacks: 1 },
  /** Below 1 tray (12 bottles) → order 1 tray. */
  "charlie's orange mandarin": { kind: "packs", minPacks: 1, orderPacks: 1 },
  "charlie's grapefruit": { kind: "packs", minPacks: 1, orderPacks: 1 },
  mint: { kind: "packs", minPacks: 1 },
  /** Reorder only below 0.2 box (100 sticks/box). */
  "honey sticks": { kind: "packs", minPacks: 0.2 },
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

function dbParRuleForIngredient(ing: RawIngredient): StockParRule | null {
  const kind = ing.stock_par_kind;
  if (!kind) return null;
  if (kind === "base") {
    const minAmount = ing.stock_par_min_amount;
    if (minAmount == null || minAmount <= 0) return null;
    return { kind: "base", minAmount };
  }
  if (kind === "packs") {
    const minPacks = ing.stock_par_min_packs;
    if (minPacks == null || minPacks < 0) return null;
    return {
      kind: "packs",
      minPacks,
      orderPacks: ing.stock_par_order_packs != null ? ing.stock_par_order_packs : undefined,
    };
  }
  return null;
}

type StockParParams = {
  rawIngredients: RawIngredient[];
  currentRawStock: Record<string, number>;
  prepStockCreditByRawId?: Record<string, number>;
  baseSuggested: Record<string, number>;
  orderPackByRawId: Record<string, IngredientPackSize | null>;
  /** Raws with a stock count in the loaded window. Non-food without a count is never suggested. */
  countedRawIds?: ReadonlySet<string>;
};

/** 'floor' only applies to an explicit DB par; the hardcoded map is always par-managed ('replace'). */
export function isFloorParIngredient(ing: RawIngredient): boolean {
  return ing.stock_par_mode === "floor" && dbParRuleForIngredient(ing) != null;
}

/**
 * Par state for one ingredient: target level, effective stock (raw + finished prep credit)
 * and what to order when below par. Null when no usable par rule applies.
 */
function parStateForIngredient(
  ing: RawIngredient,
  params: Pick<StockParParams, "currentRawStock" | "prepStockCreditByRawId" | "orderPackByRawId">
): { minBase: number; stock: number; orderBase: number } | null {
  // Prefer DB columns; fall back to hardcoded map.
  const rule =
    dbParRuleForIngredient(ing) ??
    MIN_STOCK_PAR_BY_RAW_NAME[(ing.name ?? "").toLowerCase().trim()] ??
    null;
  if (rule == null) return null;
  const orderPack = params.orderPackByRawId[ing.id] ?? null;
  const minBase = minBaseAmountForPar({ ing, rule, orderPack });
  if (minBase == null || minBase <= 0) return null;
  const stock =
    (params.currentRawStock[ing.id] ?? 0) + (params.prepStockCreditByRawId?.[ing.id] ?? 0);
  let orderBase = Math.max(0, minBase - stock);
  if (rule.kind === "packs" && rule.orderPacks != null && orderPack) {
    const basePerPack = packSizeToBaseAmount(orderPack, ing.unit ?? "");
    if (basePerPack != null && basePerPack > 0) {
      orderBase = rule.orderPacks * basePerPack;
    }
  }
  return { minBase, stock, orderBase };
}

/**
 * Par-managed items ('replace', the default): suppress when effective stock (raw + finished
 * prep credit) is at par; otherwise order only the shortfall to par — never stack
 * cover-window bulk on top.
 *
 * 'floor' items (stock_par_mode = 'floor'): the recipe-driven suggestion stays as it is; below
 * par the line is raised to at least the par order. Meant for recipe-driven products where the
 * need-based suggestion is right in principle but the kitchen wants a minimum on the shelf.
 */
export function applyStockParToBaseSuggested(params: StockParParams): Record<string, number> {
  const { rawIngredients, baseSuggested, countedRawIds } = params;
  const out = { ...baseSuggested };
  for (const ing of rawIngredients) {
    if (!isRawVisibleOnStocktake(ing)) continue;
    // An uncounted non-food item is "unknown", not "zero": don't fill every shelf on a guess.
    if (ing.item_kind === "non_food" && countedRawIds && !countedRawIds.has(ing.id)) {
      delete out[ing.id];
      continue;
    }
    const par = parStateForIngredient(ing, params);
    if (par == null) continue;
    if (isFloorParIngredient(ing)) {
      if (par.stock < par.minBase) out[ing.id] = Math.max(out[ing.id] ?? 0, par.orderBase);
      continue;
    }
    if (par.stock >= par.minBase) {
      delete out[ing.id];
      continue;
    }
    out[ing.id] = par.orderBase;
  }
  return out;
}

/**
 * Second pass for 'floor' pars, run after the product-specific gates (mint prep gate,
 * aubergine/Sabich containers, flour, garlic, …). Those gates drop a line on their own
 * criteria; an explicit floor par is a deliberate "keep at least this on the shelf" and
 * has to survive them. Only ever raises a line — never removes or lowers one.
 */
export function applyStockParFloorAfterGates(params: StockParParams): Record<string, number> {
  const { rawIngredients, baseSuggested, countedRawIds } = params;
  const out = { ...baseSuggested };
  for (const ing of rawIngredients) {
    if (!isRawVisibleOnStocktake(ing)) continue;
    if (!isFloorParIngredient(ing)) continue;
    if (ing.item_kind === "non_food" && countedRawIds && !countedRawIds.has(ing.id)) continue;
    const par = parStateForIngredient(ing, params);
    if (par == null || par.stock >= par.minBase || par.orderBase <= 0) continue;
    out[ing.id] = Math.max(out[ing.id] ?? 0, par.orderBase);
  }
  return out;
}
