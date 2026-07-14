-- Java Bakery: minimum order 65 bags (5 pcs/bag). Restore supplier MOQ rounding on
-- suggestions when there is a shortfall; daily 1-day cover (migration 158 code) avoids
-- ordering when stock already covers the next day.

UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 65, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Frozen flatbreads'))
  AND ips.pack_purpose IN ('order', 'both');
