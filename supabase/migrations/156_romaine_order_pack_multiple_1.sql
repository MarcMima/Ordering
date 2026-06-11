-- Romaine: do not force MOQ rounding to 10; app only suggests when unrounded need is >= 10 heads.

UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 1, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Romaine lettuce'));
