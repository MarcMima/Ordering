-- Restore wholewheat pita on Bidfood orders (article 173445).
-- Reverses 144 hide + 170 supplier delete; ensures per-location prep→raw links (180/181 pattern).

-- ─── Visibility + stocktake pack (box 50 pcs) ────────────────────────────────
UPDATE prep_items
SET stocktake_visible = true, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Wholewheat pita with za''atar'))
  AND stocktake_visible IS DISTINCT FROM true;

UPDATE raw_ingredients
SET
  stocktake_visible = true,
  stocktake_unit_label = 'box',
  stocktake_content_amount = 50,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Whole wheat pita bread 15 cm'))
  AND (
    stocktake_visible IS DISTINCT FROM true
    OR stocktake_unit_label IS DISTINCT FROM 'box'
    OR stocktake_content_amount IS DISTINCT FROM 50
    OR stocktake_content_unit IS DISTINCT FROM 'pcs'
  );

-- Wholewheat prep base: 1 box/day (same as regular pita after 163)
UPDATE location_prep_items lpi
SET base_quantity = GREATEST(COALESCE(lpi.base_quantity, 0), 1), updated_at = NOW()
FROM prep_items pi
WHERE lpi.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Wholewheat pita with za''atar'))
  AND COALESCE(lpi.base_quantity, 0) < 1;

-- ─── Bidfood preferred supplier link (173445 / 173445DS / DS) ────────────────
INSERT INTO supplier_ingredients (
  supplier_id,
  raw_ingredient_id,
  supplier_sku,
  supplier_article_code,
  supplier_article_name,
  order_unit,
  is_preferred,
  bf_is_active
)
SELECT
  s.id,
  ri.id,
  '173445DS',
  '173445',
  'Volkoren pitabrood 13-14cm 110g',
  'DS',
  TRUE,
  TRUE
FROM locations l
JOIN raw_ingredients ri
  ON ri.location_id = l.id
 AND lower(btrim(ri.name)) = lower(btrim('Whole wheat pita bread 15 cm'))
JOIN suppliers s
  ON s.location_id = l.id
 AND lower(btrim(s.name)) = 'bidfood'
ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
SET
  supplier_sku = EXCLUDED.supplier_sku,
  supplier_article_code = EXCLUDED.supplier_article_code,
  supplier_article_name = EXCLUDED.supplier_article_name,
  order_unit = EXCLUDED.order_unit,
  is_preferred = EXCLUDED.is_preferred,
  bf_is_active = TRUE,
  updated_at = NOW();

-- ─── Order pack: box 50 pcs (if missing) ─────────────────────────────────────
INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT ri.id, 50, 'pcs', 'both', 'box (50 pcs)', 1
FROM raw_ingredients ri
WHERE lower(btrim(ri.name)) = lower(btrim('Whole wheat pita bread 15 cm'))
  AND NOT EXISTS (
    SELECT 1 FROM ingredient_pack_sizes ips
    WHERE ips.raw_ingredient_id = ri.id
      AND ips.pack_purpose IN ('order', 'both')
  );

-- ─── Prep → raw link per location (1 prep box = 50 pcs, same as regular pita) ─
INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
SELECT p.id, ri.id, 50::numeric
FROM prep_items p
JOIN location_prep_items lpi ON lpi.prep_item_id = p.id
JOIN raw_ingredients ri
  ON ri.location_id = lpi.location_id
 AND lower(btrim(ri.name)) = lower(btrim('Whole wheat pita bread 15 cm'))
WHERE lower(btrim(p.name)) = lower(btrim('Wholewheat pita with za''atar'))
ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    updated_at = NOW();
