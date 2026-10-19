import { test } from "node:test";
import assert from "node:assert/strict";
import { deductLossesAfterCount, type StockLoss } from "../stockLosses.ts";

const loss = (id: string, date: string, createdAt: string, quantity: number): StockLoss => ({
  id,
  location_id: "loc",
  date,
  raw_ingredient_id: null,
  prep_item_id: "hummus",
  quantity,
  unit_label: null,
  reason: "equipment_failure",
  note: null,
  created_by: null,
  created_at: createdAt,
});

test("a loss after the count lowers the stock, never below zero", () => {
  const out = deductLossesAfterCount({
    stockById: { hummus: 5 },
    countById: { hummus: { date: "2026-10-19", savedAt: "2026-10-19T08:00:00Z" } },
    losses: [loss("a", "2026-10-19", "2026-10-19T14:00:00Z", 2), loss("b", "2026-10-20", "2026-10-20T09:00:00Z", 9)],
    kind: "prep",
  });
  assert.equal(out.hummus, 0);
});

test("a loss saved before the count is already in the count", () => {
  const out = deductLossesAfterCount({
    stockById: { hummus: 5 },
    countById: { hummus: { date: "2026-10-19", savedAt: "2026-10-19T08:00:00Z" } },
    losses: [loss("a", "2026-10-19", "2026-10-19T07:30:00Z", 2), loss("b", "2026-10-18", "2026-10-18T20:00:00Z", 1)],
    kind: "prep",
  });
  assert.equal(out.hummus, 5);
});

test("items without a count are left alone", () => {
  const out = deductLossesAfterCount({
    stockById: {},
    countById: {},
    losses: [loss("a", "2026-10-19", "2026-10-19T14:00:00Z", 2)],
    kind: "prep",
  });
  assert.deepEqual(out, {});
});
