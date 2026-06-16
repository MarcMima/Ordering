-- Yoghurt is een duplicaat van Greek yoghurt 10% (Tzatziki gebruikt alleen Greek yoghurt 10%).
-- Verberg generieke Yoghurt op stocktake; verwijder Bidfood-koppeling zodat ordering niet dubbel toont.

UPDATE raw_ingredients
SET stocktake_visible = false, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Yoghurt'));

DELETE FROM supplier_ingredients si
USING raw_ingredients r, suppliers s
WHERE si.raw_ingredient_id = r.id
  AND si.supplier_id = s.id
  AND lower(btrim(r.name)) = lower(btrim('Yoghurt'));
