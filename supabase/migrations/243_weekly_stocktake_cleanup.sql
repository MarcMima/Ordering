-- Applied to the Ordering Supabase project on 29-09-2026 via mima-psql.
-- Weekly stocktake cleanup after Barbara's first count (29-09-2026).
-- Units, removals, new items, section order, higher par for garbage bags and gloves.
begin;

-- 1. Count units (raw_ingredients + matching stocktake/both pack sizes)
update raw_ingredients set stocktake_unit_label='box', stocktake_content_amount=125, stocktake_content_unit='pcs' where name='Plastic bottle (rose lemonade)';
update raw_ingredients set stocktake_content_amount=25 where name in ('Soup lids','Soup container');
update raw_ingredients set stocktake_unit_label='pack', stocktake_content_amount=4, stocktake_content_unit='pcs' where name='Toiletpaper';
update raw_ingredients set stocktake_content_amount=250 where name='Napkins';
-- Washing-up liquid: count per 1 L bottle (refilled from the 5 L can), keep ordering the 5 L can (Bidfood 042902)
update raw_ingredients set stocktake_unit_label='bottle', stocktake_content_amount=1, stocktake_content_unit='l' where name='Washing-up liquid 5 L';

update ingredient_pack_sizes p set size=125, display_unit_label='box'
  from raw_ingredients r where r.id=p.raw_ingredient_id and r.name='Plastic bottle (rose lemonade)' and p.pack_purpose in ('order','both');
update ingredient_pack_sizes p set size=125, display_unit_label='box'
  from raw_ingredients r where r.id=p.raw_ingredient_id and r.name='Plastic bottle (rose lemonade)' and p.pack_purpose='stocktake';
update ingredient_pack_sizes p set size=25
  from raw_ingredients r where r.id=p.raw_ingredient_id and r.name in ('Soup lids','Soup container') and p.pack_purpose in ('stocktake','both');
update ingredient_pack_sizes p set size=4, display_unit_label='pack'
  from raw_ingredients r where r.id=p.raw_ingredient_id and r.name='Toiletpaper' and p.pack_purpose='stocktake';
update ingredient_pack_sizes p set size=250
  from raw_ingredients r where r.id=p.raw_ingredient_id and r.name='Napkins' and p.pack_purpose='stocktake';
update ingredient_pack_sizes p set pack_purpose='order'
  from raw_ingredients r where r.id=p.raw_ingredient_id and r.name='Washing-up liquid 5 L' and p.pack_purpose='both';
insert into ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
select r.id, 1, 'l', 'stocktake', 'bottle' from raw_ingredients r
where r.name='Washing-up liquid 5 L'
  and not exists (select 1 from ingredient_pack_sizes p where p.raw_ingredient_id=r.id and p.pack_purpose='stocktake');

-- 2. Off the list (hidden, not deleted: order history refers to them)
update raw_ingredients set stocktake_visible=false where name in ('Coriander (ground)','Napkins Airlaid white 40x40 (pack 60)');

-- 3. New items per location
insert into raw_ingredients (location_id, name, unit, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit, item_kind)
select l.id, v.name, 'pcs', true, 1, v.lbl, 1, 'pcs', 'food'
from locations l cross join (values ('Verbena tea','pack'),('Quatra oil','can')) as v(name,lbl)
where not exists (select 1 from raw_ingredients r where r.location_id=l.id and r.name=v.name);

-- 4. Par up for garbage bags and gloves (was 1 pack)
update raw_ingredients set stock_par_min_packs=2 where name='Garbage bags blue 145L (roll 20)';
update raw_ingredients set stock_par_min_packs=2, stock_par_order_packs=2 where name in ('Gloves small','Gloves medium','Gloves large');

-- 5. Order: spices, other food, packaging, disposables, cleaning
update raw_ingredients r set stocktake_display_order=1000 + o.n * 10
from unnest(array[
 'Black pepper','Cardamom','Chili powder','Cumin','Dried dill','Mustard powder','Sumac','Turmeric','Za''atar','Cauliflower mix','Falafel mix','Rose petals','Verbena tea',
 'Honey sticks','Tahini','Quatra oil','Coffee capsules Barzini lungo (box 80)',
 'Bowl container','Lids (bowl)','Catering container','Pita container','Lids (pita)','Mezze container','Mezze lids','Sauce cup','Sauce lid','Soup container','Soup lids','Falafel container','Napkins','Plastic bottle (rose lemonade)','Paper bags large','Paper bags small','Flatbreadchips bags with window','Paper bag (brownies)','Pita pouches','Rolling paper','Coffee cup','Coffee lids',
 'Cutlery','Daysticker Monday','Daysticker Tuesday','Daysticker Wednesday','Daysticker Thursday','Daysticker Friday','Daysticker Saturday','Daysticker Sunday','Gloves small','Gloves medium','Gloves large','Paper straws black (box 250)','Stirrer','Aluminium foil','Aluminium foil dispenser','Centerfeed paper roll','Clingfilm','Toiletpaper',
 'Garbage bags blue 145L (roll 20)','Microfiber cloth','Scouring sponges with grip (pack 10)','Steel scourers 40 g (pack 10)','Bleach 1 L','Cleaning vinegar 5 L','Dishwasher salt Broxo 10 kg','Hand soap','Rational Active Green cleaner tabs (150)','Rational Care Control tabs (150)','Topmatic Hero dishwasher detergent 25 kg','Washing-up liquid 5 L','Ecolab Clear Dry Classic 5 L (rinse aid)','Ecolab MAXX Magic S 5 L (all-purpose cleaner)'
]) with ordinality as o(name, n)
where r.name=o.name and r.stocktake_day_of_week is not null;
commit;
