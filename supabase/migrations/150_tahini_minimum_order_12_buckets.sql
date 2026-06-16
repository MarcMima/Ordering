-- Tahini (Today Food Group): minimum order 12 buckets per delivery.

UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 12, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Tahini'));
