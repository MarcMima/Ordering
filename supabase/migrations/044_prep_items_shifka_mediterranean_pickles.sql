-- Finished products: Shifka peppers, Mediterranean pickles (no default recipe rows).
INSERT INTO prep_items (name, unit)
SELECT v.name, 'g'
FROM (VALUES ('Shifka peppers'), ('Mediterranean pickles')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM prep_items p WHERE lower(trim(p.name)) = lower(trim(v.name)));

INSERT INTO location_prep_items (location_id, prep_item_id, base_quantity)
SELECT l.id, p.id, 1
FROM locations l
CROSS JOIN prep_items p
WHERE lower(trim(p.name)) IN ('shifka peppers', 'mediterranean pickles')
ON CONFLICT (location_id, prep_item_id) DO NOTHING;
