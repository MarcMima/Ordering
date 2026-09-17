import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCountDateLabel,
  isNonFoodSuggestionDay,
  latestCountDateByRawId,
} from "../stocktakeWeek.ts";

const MON = 1;

test("non-food: shown on the weekly day, hidden mid-week", () => {
  const base = { locationWeeklyDow: MON, ingredientWeeklyDow: MON, lastCountDate: "2026-09-14" };
  assert.equal(isNonFoodSuggestionDay({ ...base, dateStr: "2026-09-14" }), true);
  assert.equal(isNonFoodSuggestionDay({ ...base, dateStr: "2026-09-15" }), false);
  assert.equal(isNonFoodSuggestionDay({ ...base, dateStr: "2026-09-16" }), false);
});

test("non-food: shown mid-week when the item was counted that day", () => {
  assert.equal(
    isNonFoodSuggestionDay({
      dateStr: "2026-09-16",
      locationWeeklyDow: MON,
      ingredientWeeklyDow: MON,
      lastCountDate: "2026-09-16",
    }),
    true
  );
});

test("latest count date per raw ignores future rows", () => {
  const out = latestCountDateByRawId(
    [
      { raw_ingredient_id: "a", quantity: 1, date: "2026-09-14" },
      { raw_ingredient_id: "a", quantity: 1, date: "2026-09-12" },
      { raw_ingredient_id: "b", quantity: 1, date: "2026-09-18" },
    ],
    "2026-09-16"
  );
  assert.deepEqual(out, { a: "2026-09-14" });
});

test("count label", () => {
  assert.equal(formatCountDateLabel("2026-09-14"), "Mon 14 Sep");
});
