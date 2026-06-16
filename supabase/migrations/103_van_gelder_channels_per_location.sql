-- Van Gelder API-kanaal + leveradres per vestiging (debiteur + LeveringAdres voor dispatch-order).

ALTER TABLE supplier_order_channels
  ADD COLUMN IF NOT EXISTS delivery_address JSONB;

COMMENT ON COLUMN supplier_order_channels.delivery_address IS
  'Optioneel leveradres voor API-dispatch (o.a. Van Gelder LeveringAdres). Velden: naam, klantcode, plaats, straat, huisnummer, postcode, landcode, telefoon.';

WITH vg_map AS (
  SELECT *
  FROM (
    VALUES
      (
        'Mima Amsterdam',
        'MIMAMS1',
        jsonb_build_object(
          'naam', 'Mima | West',
          'klantcode', 'MIMAMS1',
          'plaats', 'Amsterdam',
          'straat', 'Jan Pieter Heijestraat',
          'huisnummer', '180',
          'postcode', '1054MN',
          'landcode', 'NL',
          'telefoon', '020 237 3630'
        )
      ),
      (
        'Mima Pijp',
        'MIMAMS2',
        jsonb_build_object(
          'naam', 'Mima | De Pijp',
          'klantcode', 'MIMAMS2',
          'plaats', 'Amsterdam',
          'straat', 'Ceintuurbaan',
          'huisnummer', '326',
          'postcode', '1075GM',
          'landcode', 'NL',
          'telefoon', '020 2236980'
        )
      ),
      (
        'Mima Zuidas',
        'MIMAMS3',
        jsonb_build_object(
          'naam', 'Mima | Zuidas',
          'klantcode', 'MIMAMS3',
          'plaats', 'Amsterdam',
          'straat', 'Arnold Schönberglaan',
          'huisnummer', '7',
          'postcode', '1082MJ',
          'landcode', 'NL',
          'telefoon', '020 2614879'
        )
      )
  ) AS t(location_name, customer_code, delivery_address)
)
INSERT INTO supplier_order_channels (
  supplier_id,
  channel,
  api_customer_code,
  delivery_address,
  auto_send
)
SELECT
  s.id,
  'van_gelder_api',
  vm.customer_code,
  vm.delivery_address,
  false
FROM suppliers s
JOIN locations l ON l.id = s.location_id
JOIN vg_map vm ON vm.location_name = l.name
WHERE lower(btrim(s.name)) = 'van gelder'
ON CONFLICT (supplier_id) DO UPDATE
SET
  channel = EXCLUDED.channel,
  api_customer_code = EXCLUDED.api_customer_code,
  delivery_address = EXCLUDED.delivery_address,
  updated_at = NOW();
