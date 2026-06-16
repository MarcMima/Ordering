-- Orderkanalen: GéDé (email), Java bakery (WhatsApp), Today Food Group + Tuana (email).
-- Contact: vul per locatie suppliers.contact_email in Admin; GéDé default info@gede.nl.

UPDATE suppliers
SET contact_email = 'info@gede.nl', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('GéDé'))
  AND (contact_email IS NULL OR btrim(contact_email) = '');

-- GéDé — email (zelfde adres alle vestigingen)
INSERT INTO supplier_order_channels (
  supplier_id, channel, email_to, email_subject_template, auto_send
)
SELECT
  s.id,
  'email',
  COALESCE(NULLIF(btrim(s.contact_email), ''), 'info@gede.nl'),
  'Bestelling MIMA {datum} — levering {leverdatum}',
  false
FROM suppliers s
WHERE lower(btrim(s.name)) = lower(btrim('GéDé'))
ON CONFLICT (supplier_id) DO UPDATE SET
  channel = EXCLUDED.channel,
  email_to = COALESCE(NULLIF(btrim(supplier_order_channels.email_to), ''), EXCLUDED.email_to),
  email_subject_template = EXCLUDED.email_subject_template,
  updated_at = NOW();

-- Tuana — email (email_to uit suppliers.contact_email)
INSERT INTO supplier_order_channels (
  supplier_id, channel, email_to, email_subject_template, auto_send
)
SELECT
  s.id,
  'email',
  NULLIF(btrim(s.contact_email), ''),
  'Bestelling MIMA kruiden — {datum} (levering {leverdatum})',
  false
FROM suppliers s
WHERE lower(btrim(s.name)) = lower(btrim('Tuana'))
ON CONFLICT (supplier_id) DO UPDATE SET
  channel = EXCLUDED.channel,
  email_subject_template = EXCLUDED.email_subject_template,
  email_to = COALESCE(NULLIF(btrim(supplier_order_channels.email_to), ''), EXCLUDED.email_to),
  updated_at = NOW();

-- Today Food Group — email
INSERT INTO supplier_order_channels (
  supplier_id, channel, email_to, email_subject_template, auto_send
)
SELECT
  s.id,
  'email',
  NULLIF(btrim(s.contact_email), ''),
  'Bestelling MIMA — {datum} (levering {leverdatum})',
  false
FROM suppliers s
WHERE lower(btrim(s.name)) = lower(btrim('Today Food Group'))
ON CONFLICT (supplier_id) DO UPDATE SET
  channel = EXCLUDED.channel,
  email_subject_template = EXCLUDED.email_subject_template,
  email_to = COALESCE(NULLIF(btrim(supplier_order_channels.email_to), ''), EXCLUDED.email_to),
  updated_at = NOW();

-- Java bakery — WhatsApp (telefoon in contact_info of contact_email; anders Edge secret JAVA_BAKERY_WHATSAPP_PHONE)
INSERT INTO supplier_order_channels (
  supplier_id,
  channel,
  whatsapp_phone,
  whatsapp_use_api,
  auto_send
)
SELECT
  s.id,
  'whatsapp',
  COALESCE(NULLIF(btrim(s.contact_info), ''), NULLIF(btrim(s.contact_email), '')),
  false,
  false
FROM suppliers s
WHERE lower(btrim(s.name)) = lower(btrim('Java bakery'))
ON CONFLICT (supplier_id) DO UPDATE SET
  channel = EXCLUDED.channel,
  whatsapp_phone = COALESCE(
    NULLIF(btrim(supplier_order_channels.whatsapp_phone), ''),
    EXCLUDED.whatsapp_phone
  ),
  whatsapp_use_api = false,
  updated_at = NOW();
