-- Finished product "Coated Cauliflower" (was missing from recipe bulk seed).
INSERT INTO prep_items (name, unit)
SELECT 'Coated Cauliflower', 'g'
WHERE NOT EXISTS (
  SELECT 1 FROM prep_items WHERE lower(trim(name)) = 'coated cauliflower'
);

INSERT INTO location_prep_items (location_id, prep_item_id, base_quantity)
SELECT l.id, p.id, 1
FROM locations l
CROSS JOIN prep_items p
WHERE lower(trim(p.name)) = 'coated cauliflower'
ON CONFLICT (location_id, prep_item_id) DO NOTHING;

-- Correct display name if an older draft used lowercase "cauliflower".
UPDATE prep_items SET name = 'Coated Cauliflower', updated_at = NOW()
WHERE lower(trim(name)) = 'coated cauliflower' AND name IS DISTINCT FROM 'Coated Cauliflower';
