-- Ground coriander is not sold by Van Gelder (Tuana). Remove VG mapping on all locations.

DELETE FROM supplier_ingredients si
USING raw_ingredients r, suppliers s
WHERE si.raw_ingredient_id = r.id
  AND si.supplier_id = s.id
  AND lower(btrim(r.name)) = lower(btrim('Coriander (ground)'))
  AND lower(s.name) LIKE '%van gelder%';
