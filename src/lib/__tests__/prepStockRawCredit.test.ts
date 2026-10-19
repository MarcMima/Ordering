import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGeneralPrepCreditParts } from "../prepStockRawCredit.ts";

const recipe = [
  { prep_item_id: "soup", raw_ingredient_id: "carrot", quantity_per_unit: 400 },
  { prep_item_id: "salad", raw_ingredient_id: "carrot", quantity_per_unit: 100 },
  { prep_item_id: "medi", raw_ingredient_id: "cucumber", quantity_per_unit: 1470 },
];

test("finished soup credits the soup carrots, capped at the soup share", () => {
  const parts = computeGeneralPrepCreditParts({
    recipeFiltered: recipe,
    prepStockByPrepItemId: { soup: 3 },
    neededByPrepItemId: { soup: 2, salad: 4 },
    dailyRawNeedBase: { carrot: 2 * 400 + 4 * 100 },
    rawNameByRawId: { carrot: "Carrot julienne", cucumber: "Cucumber" },
  });
  assert.equal(parts.carrot.length, 1);
  assert.equal(parts.carrot[0].credit, 1200);
  assert.equal(Number(parts.carrot[0].shareOfDailyNeed.toFixed(3)), 0.667);
  // Over a 2-day window the soup share is 1,600 g: the credit (1,200) fits, salad carrots stay.
  const need = 2 * 1200;
  const credit = Math.min(parts.carrot[0].credit, need * parts.carrot[0].shareOfDailyNeed);
  assert.equal(need - credit, 1200);
});

test("whitelisted raws keep their own credit and are skipped here", () => {
  const parts = computeGeneralPrepCreditParts({
    recipeFiltered: [{ prep_item_id: "medi", raw_ingredient_id: "lettuce", quantity_per_unit: 500 }],
    prepStockByPrepItemId: { medi: 4 },
    neededByPrepItemId: { medi: 2 },
    dailyRawNeedBase: { lettuce: 1000 },
    rawNameByRawId: { lettuce: "Romaine lettuce" },
  });
  assert.deepEqual(parts, {});
});
