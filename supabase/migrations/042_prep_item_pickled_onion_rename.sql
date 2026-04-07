-- If migration 041 ran with the earlier name "Pickled red onion", rename to "Pickled onion".
UPDATE prep_items
SET name = 'Pickled onion', updated_at = NOW()
WHERE lower(trim(name)) = 'pickled red onion';
