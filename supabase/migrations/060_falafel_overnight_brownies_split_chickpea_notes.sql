-- Falafel: not an "overnight prep" card — soak chickpeas the day before; prep list handles soak callout.
UPDATE prep_items
SET requires_overnight = false, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Falafel'));

-- Finished products: count retail brownies in pieces; count dough in grams (not "pieces of dough").
UPDATE prep_items
SET
  unit = 'g',
  content_amount = NULL,
  content_unit = NULL,
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Tahin brownie dough'));

INSERT INTO prep_items (
  name,
  unit,
  content_amount,
  content_unit,
  batch_size,
  requires_overnight,
  ingredient_qty_is_per_recipe_batch,
  category
)
SELECT
  'Brownies',
  'pieces',
  1::numeric,
  'pcs',
  NULL,
  false,
  false,
  (SELECT p.category FROM prep_items p WHERE lower(btrim(p.name)) = lower(btrim('Tahin brownie dough')) LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM prep_items pi WHERE lower(btrim(pi.name)) = lower(btrim('Brownies')));

INSERT INTO location_prep_items (location_id, prep_item_id, base_quantity, display_order)
SELECT
  lpi.location_id,
  br.id,
  COALESCE(lpi.base_quantity, 1),
  COALESCE(lpi.display_order, 0) + 5
FROM location_prep_items lpi
INNER JOIN prep_items dough ON dough.id = lpi.prep_item_id
  AND lower(btrim(dough.name)) = lower(btrim('Tahin brownie dough'))
CROSS JOIN LATERAL (
  SELECT id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Brownies')) LIMIT 1
) br
WHERE NOT EXISTS (
  SELECT 1
  FROM location_prep_items z
  WHERE z.location_id = lpi.location_id
    AND z.prep_item_id = br.id
);
