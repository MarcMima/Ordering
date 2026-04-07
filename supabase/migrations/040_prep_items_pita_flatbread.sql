-- Finished products: za'atar pitas + defrosted flatbread (not in recipe bulk seed).
INSERT INTO prep_items (name, unit)
SELECT v.name, 'g'
FROM (
  VALUES
    ('Regular pita with za''atar'),
    ('Wholewheat pita with za''atar'),
    ('Defrosted flatbread')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM prep_items p WHERE lower(trim(p.name)) = lower(trim(v.name))
);

INSERT INTO location_prep_items (location_id, prep_item_id, base_quantity)
SELECT l.id, p.id, 1
FROM locations l
CROSS JOIN prep_items p
WHERE lower(trim(p.name)) IN (
  'regular pita with za''atar',
  'wholewheat pita with za''atar',
  'defrosted flatbread'
)
ON CONFLICT (location_id, prep_item_id) DO NOTHING;
