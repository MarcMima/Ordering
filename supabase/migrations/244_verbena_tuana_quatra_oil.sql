-- Applied to the Ordering Supabase project on 29-09-2026 via mima-psql.
-- Verbena tea comes from Tuana (pack of 1 kg as a placeholder, weight unknown).
-- Frying oil comes from Quatra: boxes of 15 L (economy), ordered by e-mail, 10 boxes at a time.
begin;

update raw_ingredients
set unit='g', stocktake_unit_label='pack', stocktake_content_amount=1, stocktake_content_unit='kg', order_interval_days=7
where name='Verbena tea';

update raw_ingredients
set unit='ml', stocktake_unit_label='box', stocktake_content_amount=15, stocktake_content_unit='l',
    stock_par_kind='packs', stock_par_min_packs=1, stock_par_order_packs=10
where name='Quatra oil';

insert into ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
select r.id, v.size, v.size_unit, 'both', v.lbl
from raw_ingredients r
join (values ('Verbena tea', 1, 'kg', 'pack'), ('Quatra oil', 15, 'l', 'box (15 L)')) as v(name, size, size_unit, lbl) on v.name = r.name
where not exists (select 1 from ingredient_pack_sizes p where p.raw_ingredient_id = r.id);

insert into suppliers (location_id, name, contact_email)
select l.id, 'Quatra', 'info.nl@quatra.com'
from locations l
where not exists (select 1 from suppliers s where s.location_id = l.id and s.name = 'Quatra');

insert into supplier_order_channels (supplier_id, channel, email_to, email_subject_template)
select s.id, 'email', 'info.nl@quatra.com', 'Bestelling MIMA {datum} — levering {leverdatum}'
from suppliers s
where s.name = 'Quatra'
  and not exists (select 1 from supplier_order_channels c where c.supplier_id = s.id);

insert into supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred, supplier_article_name, order_unit)
select s.id, r.id, true, 'Frituurolie economy 15 L', 'box (15 l)'
from raw_ingredients r
join suppliers s on s.location_id = r.location_id and s.name = 'Quatra'
where r.name = 'Quatra oil'
  and not exists (select 1 from supplier_ingredients x where x.raw_ingredient_id = r.id);

insert into supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
select s.id, r.id, true
from raw_ingredients r
join suppliers s on s.location_id = r.location_id and s.name = 'Tuana'
where r.name = 'Verbena tea'
  and not exists (select 1 from supplier_ingredients x where x.raw_ingredient_id = r.id);

commit;
