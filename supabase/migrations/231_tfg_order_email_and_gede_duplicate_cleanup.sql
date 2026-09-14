-- Applied to production 14-09-2026.
-- 1) Today Food Group: order e-mail address (was empty on all locations → dispatch failed
--    with "email_to not configured").
UPDATE suppliers
SET contact_email = 'sales@todaytradingcompany.nl', updated_at = NOW()
WHERE lower(btrim(name)) = 'today food group';

INSERT INTO supplier_order_channels (supplier_id, channel, email_to, email_subject_template, auto_send)
SELECT id, 'email', 'sales@todaytradingcompany.nl', 'Bestelling MIMA — {datum} (levering {leverdatum})', false
FROM suppliers
WHERE lower(btrim(name)) = 'today food group'
ON CONFLICT (supplier_id) DO UPDATE SET
  channel = 'email',
  email_to = EXCLUDED.email_to,
  updated_at = NOW();

-- 2) Duplicate "GeDe" suppliers (created by the kostprijs import in 203, no items, no channel)
--    next to the real "GéDé": move their price rows (GeDe prijslijst 2026 import, 52 rows)
--    to the GéDé supplier of the same location, then delete the duplicates.
UPDATE ingredient_prices ip
SET supplier_id = proper.id
FROM suppliers dup
JOIN suppliers proper
  ON proper.location_id = dup.location_id AND proper.name = 'GéDé'
WHERE ip.supplier_id = dup.id
  AND dup.name = 'GeDe';

DELETE FROM suppliers dup
WHERE dup.name = 'GeDe'
  AND NOT EXISTS (SELECT 1 FROM supplier_ingredients WHERE supplier_id = dup.id)
  AND NOT EXISTS (SELECT 1 FROM ingredient_prices WHERE supplier_id = dup.id)
  AND NOT EXISTS (SELECT 1 FROM orders WHERE supplier_id = dup.id)
  AND NOT EXISTS (SELECT 1 FROM order_dispatches WHERE supplier_id = dup.id)
  AND NOT EXISTS (SELECT 1 FROM supplier_order_channels WHERE supplier_id = dup.id)
  AND NOT EXISTS (SELECT 1 FROM supplier_delivery_schedules WHERE supplier_id = dup.id)
  AND NOT EXISTS (SELECT 1 FROM scraper_runs WHERE supplier_id = dup.id);
