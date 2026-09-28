import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeBaseSuggestions,
  countsAsStructural,
  isStructuralNote,
} from "../prepBaseSuggestions.ts";
import type { PrepListAdjustment } from "../types.ts";

const adj = (date: string, reason: string, note: string | null): PrepListAdjustment =>
  ({
    id: date,
    location_id: "loc",
    date,
    prep_item_id: "hummus",
    custom_name: null,
    make_override: 3,
    removed: false,
    reason,
    reason_note: note,
    stock_at_edit: 1,
    revenue_multiplier: 1,
    created_at: `${date}T10:00:00Z`,
    updated_at: `${date}T10:00:00Z`,
  }) as unknown as PrepListAdjustment;

const lpi = [{ id: "lpi", prep_item_id: "hummus", base_quantity: 2, prep_items: { name: "Hummus" } }];

test("habit phrases are structural", () => {
  assert.equal(isStructuralNote("We always make 3 on Fridays"), true);
  assert.equal(isStructuralNote("never enough at lunch"), true);
  assert.equal(isStructuralNote("catering for 40 people"), false);
  assert.equal(isStructuralNote(null), false);
});

test("event only counts when its note describes a habit", () => {
  assert.equal(countsAsStructural({ reason: "event", reason_note: "catering" }), false);
  assert.equal(countsAsStructural({ reason: "event", reason_note: "we always make more" }), true);
  assert.equal(countsAsStructural({ reason: "other", reason_note: null }), true);
});

test("structural event notes feed the suggestion and are shown", () => {
  const out = computeBaseSuggestions({
    adjustments: [
      adj("2026-09-14", "event", "we always make 4 on Monday"),
      adj("2026-09-15", "other", "usually runs out"),
      adj("2026-09-16", "model_wrong", null),
      adj("2026-09-17", "event", "catering 40 pax"),
    ],
    locationPrepItems: lpi,
    decisions: [],
    // Nothing left the next morning: used = 1 + 3 − 0 = 4 per day.
    counts: ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"].map((date) => ({
      prep_item_id: "hummus",
      date,
      quantity: 0,
    })),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].occurrences, 3);
  // Learned 4, but one step moves at most ×1.5 from base 2.
  assert.equal(out[0].suggestedBase, 3);
  assert.deepEqual(out[0].notes, ["usually runs out", "we always make 4 on Monday"]);
});

const day = (date: string, stock: number, make: number, mult = 0.6667): PrepListAdjustment =>
  ({
    ...adj(date, "model_wrong", null),
    stock_at_edit: stock,
    make_override: make,
    revenue_multiplier: mult,
  }) as PrepListAdjustment;

test("keeping days of stock on hand does not inflate the base (Pijp Medi salad, Sept 2026)", () => {
  // Kitchen holds ~14 containers after prep but only uses ~5 a day. The old formula
  // ((stock + make) / multiplier) suggested 21; real usage keeps the base at 7.
  const out = computeBaseSuggestions({
    adjustments: [day("2026-09-24", 8, 6), day("2026-09-25", 9, 5), day("2026-09-26", 6, 4)],
    locationPrepItems: [{ ...lpi[0], base_quantity: 7 }],
    decisions: [],
    counts: [
      { prep_item_id: "hummus", date: "2026-09-25", quantity: 9 },
      { prep_item_id: "hummus", date: "2026-09-26", quantity: 6 },
      { prep_item_id: "hummus", date: "2026-09-27", quantity: 5 },
    ],
  });
  assert.equal(out.length, 0);
});

test("no next-day count means no evidence", () => {
  const out = computeBaseSuggestions({
    adjustments: [day("2026-09-24", 8, 6), day("2026-09-25", 9, 5), day("2026-09-26", 6, 4)],
    locationPrepItems: lpi,
    decisions: [],
    counts: [],
  });
  assert.equal(out.length, 0);
});

test("a batch that was not made yet (negative usage) is ignored", () => {
  const out = computeBaseSuggestions({
    adjustments: [day("2026-09-24", 2, 6), day("2026-09-25", 2, 6), day("2026-09-26", 2, 6)],
    locationPrepItems: lpi,
    decisions: [],
    counts: [
      { prep_item_id: "hummus", date: "2026-09-25", quantity: 12 },
      { prep_item_id: "hummus", date: "2026-09-26", quantity: 12 },
      { prep_item_id: "hummus", date: "2026-09-27", quantity: 12 },
    ],
  });
  assert.equal(out.length, 0);
});
