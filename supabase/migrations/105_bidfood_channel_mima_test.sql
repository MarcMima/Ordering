-- Mima TEST is default location in the app; Bidfood needs api_customer_code for dispatch-order.
-- Uses Amsterdam test credentials (074380) until separate TEST credentials exist.

INSERT INTO supplier_order_channels (supplier_id, channel, api_base_url, api_customer_code, auto_send)
SELECT s.id, 'bidfood_api', 'https://bas.bidfood.nl', '074380', false
FROM suppliers s
JOIN locations l ON l.id = s.location_id
WHERE lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(l.name)) = 'mima test'
ON CONFLICT (supplier_id) DO UPDATE
SET
  channel = EXCLUDED.channel,
  api_base_url = EXCLUDED.api_base_url,
  api_customer_code = EXCLUDED.api_customer_code,
  updated_at = NOW();
