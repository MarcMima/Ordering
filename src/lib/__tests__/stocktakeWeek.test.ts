import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCountDateLabel,
  latestCountDateByRawId,
} from "../stocktakeWeek.ts";

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
