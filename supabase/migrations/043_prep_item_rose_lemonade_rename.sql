-- Rename finished product "Rose cooler" → "Rose lemonade".
UPDATE prep_items
SET name = 'Rose lemonade', updated_at = NOW()
WHERE lower(trim(name)) = 'rose cooler';
