-- Java Bakery: orders per e-mail to java.bakkerij@gmail.com (Bilal, 25-09-2026).
-- The WhatsApp channel had no API, so the 18:00 flush only built a wa.me link and
-- marked the order "sent" without anything reaching Java.
update suppliers
set contact_email = 'java.bakkerij@gmail.com'
where id in (
  '81303e3b-f0e4-4848-8273-20525eab30a7',
  'ee4e60a0-6b84-45c2-a58b-4d796d309008',
  'e1e7153a-2aeb-418f-bc65-7fde8e00a9d2'
);

update supplier_order_channels
set channel = 'email',
    email_to = 'java.bakkerij@gmail.com',
    email_subject_template = 'Bestelling MIMA {datum} — levering {leverdatum}',
    updated_at = now()
where supplier_id in (
  '81303e3b-f0e4-4848-8273-20525eab30a7',
  'ee4e60a0-6b84-45c2-a58b-4d796d309008',
  'e1e7153a-2aeb-418f-bc65-7fde8e00a9d2'
);

-- One flatbread bag = 5 pieces; without a unit the message read "65 undefined".
update supplier_ingredients
set order_unit = 'bags (5 pcs)'
where id in (
  'fea5ca0b-dc2e-4b3c-9bd6-2840b204bc01',
  '6dc24ed3-316a-4df9-9320-9b80554e46d2',
  'ce82d10c-d4b4-47ec-be1b-1c66e7b24dee'
);
