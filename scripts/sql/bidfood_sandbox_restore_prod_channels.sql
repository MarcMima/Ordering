-- Herstel Bidfood-kanalen naar productie-URL en klantnummers per locatie (zoals migratie 096).

WITH bidfood_map(location_name, customer_code) AS (
  VALUES
    ('Mima Amsterdam', '074380'),
    ('Mima Pijp', '076970'),
    ('Mima Zuidas', '080840')
)
UPDATE supplier_order_channels soc
SET
  api_base_url = 'https://bas.bidfood.nl',
  api_customer_code = bm.customer_code,
  updated_at = NOW()
FROM suppliers s
JOIN locations l ON l.id = s.location_id
JOIN bidfood_map bm ON bm.location_name = l.name
WHERE soc.supplier_id = s.id
  AND soc.channel = 'bidfood_api'
  AND lower(btrim(s.name)) = 'bidfood';
