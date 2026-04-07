# Kitchen model – advice for units, ordering, splits, supplier mapping

This doc answers your six points and ties them to the current schema (`prep_items`, `location_prep_items`, `raw_ingredients`, `prep_item_ingredients`, `daily_prep_counts`, `daily_stock_counts`).

---

## 1) Finished products in **units** (bottles, GN containers, bags, pieces) – not grams

**Today:** Bulk seed sets `prep_items.unit = 'g'`. Stocktake/prep list show that unit as a label only; **counts are just numbers** – they can already mean “5 bottles” if you treat them that way.

**Recommended approach:**

| Layer | What to store | Where |
|--------|----------------|--------|
| **Count unit (UI)** | Human label: `bottle`, `1/2 GN container`, `1/3 GN container`, `bag`, `piece` | `prep_items.unit` (TEXT) – edit per product in **Admin → Products** |
| **Recipe / ordering (raw)** | Still in **grams (or kg)** per **1 count unit** | `prep_item_ingredients.quantity_per_unit` = “grams of raw X per 1 bottle/container/bag” |

So for **Amba**: set `prep_items.unit` to e.g. `bottle`. In **Recipes**, keep quantities as grams **per 1 bottle** (or per batch that yields N bottles – then `base_quantity` and counts should follow the same definition).

**Important:** `base_quantity` on `location_prep_items` is “how many units at full-capacity revenue”. If full capacity means “we need 10 bottles Amba”, set `base_quantity = 10` and the revenue multiplier scales bottles, not grams.

**Action:** Stop relying on bulk seed for unit text after first import – run SQL or Admin to set units, e.g.:

```sql
UPDATE prep_items SET unit = 'bottle' WHERE name = 'Amba';
UPDATE prep_items SET unit = '1/2 GN container' WHERE name ILIKE '%sabich%';
-- etc.
```

Optional later: add `prep_items.count_unit` separate from a future `recipe_unit` if you ever need both on screen at once; for most cases one `unit` is enough.

### Content per count unit (bottle / container)

Migration **017** adds:

- **`prep_items.content_amount`** – numeric, e.g. `750`
- **`prep_items.content_unit`** – e.g. `g`, `ml`

Meaning: **one** bottle/container holds that much **net** product. Then:

- **5 bottles × 750 g** → **3750 g** total product; recipes defined per kg can multiply accordingly.
- **Prep list / ordering** can use `totalContentInBaseUnit()` in `calculations.ts` when you need to bridge “count units” ↔ “grams for raw need”.

Keep **`prep_item_ingredients.quantity_per_unit`** consistent: either “grams raw per **1 bottle**” or “per **1 kg** product” — if per kg, convert with `(count × content_amount in g) / 1000` before applying recipe.

---

## 2) **Sort order** of finished products (kitchen flow)

**Recommendation:** Add an explicit order on the **location link**, not on the global prep item, so the same product can be ordered differently per location.

- **Column:** `location_prep_items.display_order INTEGER NOT NULL DEFAULT 0` (lower = earlier in list).
- **UI:** Admin → Locations → Manage products: drag-and-drop or numeric order field.
- **App:** Stocktake + Prep list + Ordering suggestions: `ORDER BY display_order, prep_item name`.

Migration `016_location_prep_display_order.sql` adds this column; wire ordering in the app next.

---

## 3) Raw ingredients as part of stocktake (needed − still have)

**Already there:** Stocktake has **2. Raw ingredients** and writes `daily_stock_counts`. Ordering suggestion uses `calcSuggestedOrderFromPrep` (to make prep → raw need − current raw stock).

**To align with “bestelling = nodig − nog”:**

- Treat **daily_stock_counts** as “still have” for that date.
- **Needed** comes from prep to-make × recipe, or from explicit targets later.
- Optional: show on Ordering page explicitly: “Need X, have Y, suggest order Z” per raw line.

No schema change required for the basic story; it’s mostly UX and making sure every raw line used in recipes is counted in stocktake.

---

## 4) **Split** products (Sabich: raw aubergine → marinating → ready tomorrow)

You need **three concepts** at once:

1. **Raw stock** – aubergines (already `raw_ingredients` + `daily_stock_counts`).
2. **Ready for use today** – sabich that can go out today.
3. **Ready tomorrow** – sabich still resting (overnight).

**Option A – Two (or three) prep items (simplest):**

- `Aubergine (raw)` – only as **raw ingredient** (no prep count) or as prep if you also count prepped aubergine before marinating.
- `Sabich (marinating)` – `requires_overnight = true` → already appears under **Tomorrow** on prep list.
- `Sabich (ready)` – optional second prep item if you want a separate stocktake line for “ready now”.

**Option B – One prep item + two count buckets (more work):**

- Would require something like `daily_prep_counts` + `available_date` or a second table for “tomorrow’s batch” – heavier schema.

**Practical recommendation:** Use **Option A**:  
- Keep **aubergine** as raw only.  
- **Sabich** as prep item with `requires_overnight = true` so prep list splits today vs tomorrow.  
- If you must stocktake “ready now” vs “ready tomorrow” separately, add a second prep item e.g. “Sabich – ready today” and link recipes only to the stage that consumes raw.

---

## 5) **Consumption per revenue** (€2000 → 5 containers chicken; Mon delivery → 3 days → 15 containers; double revenue → 30)

**Already partially modelled:**

- `location_prep_items.base_quantity` = units at **full-capacity revenue** (from `locations.full_capacity_revenue`).
- `getRevenueMultiplier` uses today’s revenue target vs full capacity only (no weekend bump; delivery gaps are modelled via supplier schedules / ordering horizon, not a locatie-weekendfactor).
- `calcNeededQuantity` = `base_quantity × revenue_multiplier` → needed units **for that day**.

**Gap:** Ordering should cover **days until next delivery**, not only “today’s shortfall”.

**Existing helper:** `calcOrderQty({ neededPerDay, daysUntilDelivery, currentStock })` in `calculations.ts`.

**Wiring plan:**

1. For each prep item (or each raw via recipes), **needed per day** = `calcNeededQuantity` for that day (or average over span).
2. **Days until delivery** from `supplier_delivery_schedules` (you already have `daysUntilNextDelivery`).
3. **Order quantity** = `neededPerDay × daysCovered − currentStock` (raw or finished, depending on what you order).

If revenue goes from €2000 to €4000, multiplier doubles → needed per day doubles → suggested order doubles, as long as `base_quantity` is calibrated at full capacity correctly.

**Optional table:** `prep_item_consumption` (prep_item_id, revenue_cents, units_per_day) if you don’t want to derive everything from `base_quantity` + full_capacity_revenue – only needed if the relationship is not linear.

---

## 6) **Map full raw ingredient list to supplier order lists**

**Recommendation:** Many-to-many – one raw ingredient can be bought from multiple suppliers.

**Table sketch:**

```text
supplier_ingredients (
  id UUID PK,
  supplier_id UUID REFERENCES suppliers,
  raw_ingredient_id UUID REFERENCES raw_ingredients,
  supplier_sku TEXT NULL,        -- optional code on their price list
  is_preferred BOOLEAN DEFAULT false,
  UNIQUE(supplier_id, raw_ingredient_id)
)
```

**Usage:**

- Ordering screen: default supplier per raw (preferred) or split lines by supplier.
- Export “supplier X order list” = all `supplier_ingredients` for X joined with suggested quantities.

Migration can add `supplier_ingredients` + RLS similar to other anon tables if the app uses anon key.

---

## Summary

| # | Topic | Main lever |
|---|--------|------------|
| 1 | Units | `prep_items.unit` + keep recipes in “per count unit”; set `base_quantity` in that unit |
| 2 | Sort order | `location_prep_items.display_order` + ORDER BY in app |
| 3 | Raw in stocktake | Already supported; clarify UX as need − have |
| 4 | Sabich split | Raw = ingredient; prep items for marinating (overnight) vs ready |
| 5 | Revenue → order size | `base_quantity` + multiplier + `calcOrderQty` over delivery span |
| 6 | Supplier mapping | `supplier_ingredients` (or `raw_ingredients.supplier_id` if 1:1 only) |

Next step in repo: apply `016` migration, then Admin UI for display order + supplier mapping, then Ordering page to use delivery span for suggested quantities.
