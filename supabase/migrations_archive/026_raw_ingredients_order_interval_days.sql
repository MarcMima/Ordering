-- How far ahead to plan when suggesting order quantities (Ordering page).
-- NULL or 1 = cover today's prep shortfall only (default).
-- 7 = multiply suggested shortfall × 7 (e.g. spices you restock weekly).

ALTER TABLE raw_ingredients
  ADD COLUMN IF NOT EXISTS order_interval_days INTEGER NULL;

COMMENT ON COLUMN raw_ingredients.order_interval_days IS
  'Order suggestion horizon in days. NULL/1 = today''s gap only; 7 = weekly planning (multiply raw shortfall). Typical: spices 7, fresh produce 1.';

-- Optional starter set (adjust names to match your DB)
UPDATE raw_ingredients
SET order_interval_days = 7
WHERE location_id = 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a'
  AND order_interval_days IS NULL
  AND (
    lower(name) LIKE '%pepper%'
    OR lower(name) LIKE '%cumin%'
    OR lower(name) LIKE '%cardamom%'
    OR lower(name) LIKE '%turmeric%'
    OR lower(name) LIKE '%kurkuma%'
    OR lower(name) LIKE '%sumac%'
    OR lower(name) LIKE '%za''aatar%'
    OR lower(name) LIKE '%falafel spice%'
    OR lower(name) LIKE '%spicemix%'
    OR lower(name) LIKE '%dried dill%'
    OR lower(name) LIKE '%rose petals%'
  );
