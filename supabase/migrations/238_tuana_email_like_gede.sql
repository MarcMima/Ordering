-- Tuana: order per e-mail to info@tuana-kruiden.nl, same subject as GéDé (Marc, 23-09-2026).
update suppliers
set contact_email = 'info@tuana-kruiden.nl'
where id in (
  '5a48a97b-6b8e-444c-9700-9f033290c86a',
  '0aef8607-31eb-4236-b528-708b0b0e0d5a',
  '98dc822e-7856-414b-a770-631c569d6098'
);

update supplier_order_channels
set email_to = 'info@tuana-kruiden.nl',
    email_subject_template = 'Bestelling MIMA {datum} — levering {leverdatum}',
    updated_at = now()
where supplier_id in (
  '5a48a97b-6b8e-444c-9700-9f033290c86a',
  '0aef8607-31eb-4236-b528-708b0b0e0d5a',
  '98dc822e-7856-414b-a770-631c569d6098'
);
