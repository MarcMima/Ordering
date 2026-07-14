-- West makes medi salad from loose cucumber + sliced tomato (Van Gelder), not the VG 3 kg tub.
-- Pijp/Zuidas keep Medi salad 3kg (see locationUsesVanGelderMediSaladTub in orderingAdjustments.ts).

UPDATE raw_ingredients ri
SET stocktake_visible = FALSE, updated_at = NOW()
FROM locations l
WHERE ri.location_id = l.id
  AND l.id = 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a'
  AND lower(btrim(ri.name)) = lower(btrim('Medi salad 3kg'));

DELETE FROM supplier_ingredients si
USING raw_ingredients ri, suppliers s, locations l
WHERE si.raw_ingredient_id = ri.id
  AND si.supplier_id = s.id
  AND ri.location_id = l.id
  AND l.id = 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a'
  AND lower(btrim(s.name)) = 'van gelder'
  AND lower(btrim(ri.name)) = lower(btrim('Medi salad 3kg'));
