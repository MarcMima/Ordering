-- Bidfood delivery Mon/Thu/Sat; chicken 5 kg/GN recipe + 10 kg order pack; par-item renames.

-- ─── Bidfood: Monday (0), Thursday (3), Saturday (5) ─────────────────────────
DELETE FROM supplier_delivery_schedules sds
USING suppliers s
WHERE sds.supplier_id = s.id
  AND lower(btrim(s.name)) = lower(btrim('Bidfood'));

INSERT INTO supplier_delivery_schedules (supplier_id, location_id, day_of_week)
SELECT s.id, s.location_id, d.day
FROM suppliers s
JOIN (VALUES (0), (3), (5)) AS d(day) ON TRUE
WHERE lower(btrim(s.name)) = lower(btrim('Bidfood'))
ON CONFLICT DO NOTHING;

-- ─── Marinated chicken: 5 kg raw per GN 1/3 (not 10 kg) ─────────────────────
UPDATE prep_item_ingredients pii
SET quantity_per_unit = 5000, updated_at = NOW()
FROM prep_items pi
WHERE pii.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Marinated chicken'))
  AND pii.quantity_per_unit IS DISTINCT FROM 5000;

-- ─── Chicken: order/stocktake pack 10 kg (Bidfood gemarineerde kip doos 10 kg) ─
UPDATE raw_ingredients
SET stocktake_unit_label = 'container',
    stocktake_content_amount = 10.0,
    stocktake_content_unit = 'kg',
    updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Chicken'));

UPDATE ingredient_pack_sizes ips
SET size = 10.0,
    size_unit = 'kg',
    display_unit_label = 'container',
    updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Chicken'))
  AND ips.pack_purpose IN ('order', 'both');

UPDATE supplier_ingredients si
SET supplier_sku = '172799DS',
    supplier_article_code = '172799',
    supplier_article_name = 'Gemarineerde kipdijstukken doos 10 kg',
    order_unit = 'DS',
    updated_at = NOW()
FROM suppliers s, raw_ingredients ri
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id = ri.id
  AND lower(btrim(s.name)) = lower(btrim('Bidfood'))
  AND lower(btrim(ri.name)) = lower(btrim('Chicken'));

-- ─── Eggplant puree → Aubergine puree ────────────────────────────────────────
UPDATE raw_ingredients
SET name = 'Aubergine puree', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Eggplant puree'));

-- ─── Tahini: weekly stocktake (Tuesday) ──────────────────────────────────────
UPDATE raw_ingredients
SET stocktake_day_of_week = 1,
    order_interval_days = 7,
    updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Tahini'));

-- ─── Kalamata olives: ensure visible, jar 5.2 kg pit ───────────────────────
UPDATE raw_ingredients
SET stocktake_visible = TRUE,
    stocktake_unit_label = 'jar',
    stocktake_content_amount = 5.2,
    stocktake_content_unit = 'kg',
    updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Kalamata olives'));
