-- Pickled onion/cabbage: another −40% on daily base (after migration 152 −25%).
--   Pickled onion:   3.00 → 1.80 GN 1/3 per day
--   Pickled cabbage: 2.25 → 1.35 GN 1/3 per day
-- Onion peeled: order/stocktake in 5 kg bags (Van Gelder ST, art. 106638).

UPDATE location_prep_items lpi
SET base_quantity = CASE
  WHEN lower(btrim(pi.name)) = lower(btrim('Pickled onion')) THEN 1.8
  WHEN lower(btrim(pi.name)) = lower(btrim('Pickled cabbage')) THEN 1.35
  ELSE lpi.base_quantity
END
FROM prep_items pi
WHERE lpi.prep_item_id = pi.id
  AND lower(btrim(pi.name)) IN (
    lower(btrim('Pickled onion')),
    lower(btrim('Pickled cabbage'))
  );

UPDATE raw_ingredients
SET stocktake_unit_label = 'bag',
    stocktake_content_amount = 5,
    stocktake_content_unit = 'kg',
    updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Onion peeled'));

UPDATE ingredient_pack_sizes ips
SET size = 5,
    size_unit = 'kg',
    display_unit_label = 'bag (5 kg)',
    pack_purpose = 'both',
    order_pack_multiple = 1,
    updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Onion peeled'));
