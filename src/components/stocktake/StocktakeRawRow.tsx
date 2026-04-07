"use client";

import { memo } from "react";
import type { IngredientPackSize, RawIngredient } from "@/lib/types";
import { formatDecimal2 } from "@/lib/format";
import {
  baseAmountFromRawMaster,
  getDefaultPack,
  getGramStockBoxPack,
  packsForStocktake,
  rawUnitLower,
} from "@/lib/stocktakeRawPackMath";
import { SortableStocktakeItem } from "./SortableStocktakeItem";

const rawCardClass =
  "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800";

export type StocktakeRawRowProps = {
  ing: RawIngredient;
  sortable: boolean;
  packs: IngredientPackSize[];
  rawCounts: Record<string, number>;
  rawCountSaving: Record<string, boolean>;
  setRawCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  saveRawCount: (rawIngredientId: string, quantity: number) => void;
  handleRawCountChange: (rawIngredientId: string, value: string) => void;
};

export const StocktakeRawRow = memo(function StocktakeRawRow({
  ing,
  sortable,
  packs,
  rawCounts,
  rawCountSaving,
  setRawCounts,
  saveRawCount,
  handleRawCountChange,
}: StocktakeRawRowProps) {
  const ru = rawUnitLower(ing);
  const packListSt = packsForStocktake(packs);
  const boxForGram = getGramStockBoxPack(ing, packListSt);
  const countGramsAsBoxes = ru === "g" && boxForGram != null;
  const defPack = getDefaultPack(ing, packs);
  const masterBase = baseAmountFromRawMaster(ing);
  const countWithMaster = !countGramsAsBoxes && masterBase != null && masterBase > 0;
  const baseStock = rawCounts[ing.id] ?? 0;
  const countWithDefPack =
    !countGramsAsBoxes && !countWithMaster && defPack != null && defPack.baseAmount > 0;
  const countGramsPlain = ru === "g" && !countGramsAsBoxes && !countWithMaster && !countWithDefPack;
  const countKg = ru === "kg";
  const countMlPlain = ru === "ml" && !countWithMaster && !countWithDefPack;

  let value: string;
  let unitHint: string | null = null;
  if (countGramsAsBoxes && boxForGram) {
    const gpg = boxForGram.pack.grams_per_piece ?? boxForGram.baseAmount / (Number(boxForGram.pack.size) || 1);
    unitHint = `Boxes (~${formatDecimal2(Number(gpg))} g each)`;
    value =
      rawCounts[ing.id] === undefined
        ? ""
        : formatDecimal2(baseStock / boxForGram.baseAmount);
  } else if (countWithMaster && masterBase != null) {
    const stockLabel = ing.stocktake_unit_label?.trim() ?? "unit";
    const amt = ing.stocktake_content_amount;
    unitHint = `${stockLabel}: ${amt != null ? formatDecimal2(Number(amt)) : "—"} ${ing.stocktake_content_unit ?? ""}`;
    value =
      rawCounts[ing.id] === undefined ? "" : formatDecimal2(baseStock / masterBase);
  } else if (countWithDefPack && defPack) {
    const lbl = defPack.pack.display_unit_label?.trim();
    const sz = Number(defPack.pack.size);
    const sizeStr = Number.isFinite(sz) ? formatDecimal2(sz) : String(defPack.pack.size);
    unitHint = lbl
      ? `${lbl}: ${sizeStr} ${defPack.pack.size_unit}`
      : `${sizeStr} ${defPack.pack.size_unit}`;
    value =
      rawCounts[ing.id] === undefined ? "" : formatDecimal2(baseStock / defPack.baseAmount);
  } else if (countGramsPlain) {
    unitHint = "g";
    value = rawCounts[ing.id] === undefined ? "" : formatDecimal2(baseStock);
  } else if (countKg) {
    unitHint = "kg";
    value = rawCounts[ing.id] === undefined ? "" : formatDecimal2(baseStock);
  } else if (countMlPlain) {
    unitHint = "ml";
    value = rawCounts[ing.id] === undefined ? "" : formatDecimal2(baseStock);
  } else {
    unitHint = ing.unit || null;
    value = rawCounts[ing.id] === undefined ? "" : formatDecimal2(baseStock);
  }

  const isSaving = rawCountSaving[ing.id];
  const inner = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="break-words text-pretty font-medium text-zinc-900 dark:text-zinc-100">{ing.name}</p>
        {unitHint && <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{unitHint}</p>}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          placeholder="0"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (countGramsAsBoxes && boxForGram) {
              const boxes = v === "" ? 0 : parseFloat(v) || 0;
              const grams = boxes * boxForGram.baseAmount;
              setRawCounts((c) => ({ ...c, [ing.id]: grams }));
              saveRawCount(ing.id, grams);
              return;
            }
            if (countWithMaster && masterBase != null) {
              const n = v === "" ? 0 : parseFloat(v) || 0;
              const baseQty = n * masterBase;
              setRawCounts((c) => ({ ...c, [ing.id]: baseQty }));
              saveRawCount(ing.id, baseQty);
              return;
            }
            if (countWithDefPack && defPack) {
              const packsNum = v === "" ? 0 : parseFloat(v) || 0;
              const baseQty = packsNum * defPack.baseAmount;
              setRawCounts((c) => ({ ...c, [ing.id]: baseQty }));
              saveRawCount(ing.id, baseQty);
              return;
            }
            if (countGramsPlain) {
              const grams = v === "" ? 0 : parseFloat(v) || 0;
              setRawCounts((c) => ({ ...c, [ing.id]: grams }));
              saveRawCount(ing.id, grams);
              return;
            }
            if (countKg) {
              const kg = v === "" ? 0 : parseFloat(v) || 0;
              setRawCounts((c) => ({ ...c, [ing.id]: kg }));
              saveRawCount(ing.id, kg);
              return;
            }
            if (countMlPlain) {
              const ml = v === "" ? 0 : parseFloat(v) || 0;
              setRawCounts((c) => ({ ...c, [ing.id]: ml }));
              saveRawCount(ing.id, ml);
              return;
            }
            if (!defPack || defPack.baseAmount <= 0) return handleRawCountChange(ing.id, v);
            const packsLoose = v === "" ? 0 : parseFloat(v) || 0;
            const baseQtyLoose = packsLoose * defPack.baseAmount;
            setRawCounts((c) => ({ ...c, [ing.id]: baseQtyLoose }));
            saveRawCount(ing.id, baseQtyLoose);
          }}
          className="h-16 w-full min-h-[56px] min-w-[140px] max-w-[180px] rounded-xl border border-zinc-300 bg-zinc-50 px-4 text-xl font-medium tabular-nums touch-manipulation dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          aria-label={`Stock ${ing.name}`}
        />
        {isSaving && <span className="text-xs text-zinc-400">Saving</span>}
      </div>
    </div>
  );

  if (sortable) {
    return (
      <SortableStocktakeItem id={ing.id} dragLabel={ing.name} className={rawCardClass}>
        {inner}
      </SortableStocktakeItem>
    );
  }
  return <li className={rawCardClass}>{inner}</li>;
});
