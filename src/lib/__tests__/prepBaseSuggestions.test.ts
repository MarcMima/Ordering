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
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].occurrences, 3);
  assert.equal(out[0].suggestedBase, 4);
  assert.deepEqual(out[0].notes, ["usually runs out", "we always make 4 on Monday"]);
});
