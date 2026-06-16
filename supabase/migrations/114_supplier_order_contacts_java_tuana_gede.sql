-- Productie-contacten: Java bakery (WhatsApp), Tuana (email), GéDé (email + cc).

-- Java bakery — zakelijk WhatsApp
UPDATE suppliers
SET
  contact_info = '+31620517867',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Java bakery'));

UPDATE supplier_order_channels soc
SET
  channel = 'whatsapp',
  whatsapp_phone = '+31620517867',
  whatsapp_use_api = false,
  updated_at = NOW()
FROM suppliers s
WHERE soc.supplier_id = s.id
  AND lower(btrim(s.name)) = lower(btrim('Java bakery'));

-- Tuana — email
UPDATE suppliers
SET
  contact_email = 'Info@tuana-kruiden.nl',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Tuana'));

UPDATE supplier_order_channels soc
SET
  channel = 'email',
  email_to = 'Info@tuana-kruiden.nl',
  email_subject_template = 'Bestelling MIMA kruiden — {datum} (levering {leverdatum})',
  updated_at = NOW()
FROM suppliers s
WHERE soc.supplier_id = s.id
  AND lower(btrim(s.name)) = lower(btrim('Tuana'));

-- GéDé — email + kopie Tos
UPDATE suppliers
SET
  contact_email = 'info@gede.nl',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('GéDé'));

UPDATE supplier_order_channels soc
SET
  channel = 'email',
  email_to = 'info@gede.nl',
  email_cc = 'Tos@gede.nl',
  email_subject_template = 'Bestelling MIMA {datum} — levering {leverdatum}',
  updated_at = NOW()
FROM suppliers s
WHERE soc.supplier_id = s.id
  AND lower(btrim(s.name)) = lower(btrim('GéDé'));
