-- Java Bakery: subject shows location and delivery day (Marc, 25-09-2026).
update supplier_order_channels
set email_subject_template = 'MIMA order {locatie} — delivery {leverdag}',
    updated_at = now()
where supplier_id in (
  '81303e3b-f0e4-4848-8273-20525eab30a7',
  'ee4e60a0-6b84-45c2-a58b-4d796d309008',
  'e1e7153a-2aeb-418f-bc65-7fde8e00a9d2'
);
