-- ============================================================================
-- Migratie 213 — verwerkt Marc's antwoorden van 01-09-2026
--   A. Verpakking koppelen aan gerechten
--   B. Pekelvocht in de pickles
--   C. Turmeric rice: volledige receptuur (parboiled rice)
--   D. Bloemkoolcoating: spicemix + rijstbloem 2:3 (hoeveelheid nog te meten)
--   E. Nieuwe menu-items: Mediterranean pickles, Shifka peppers, Coca-Cola Zero
-- Draai NA migratie 212. Eén transactie.
--
-- LET OP bij sectie B en C: die gebruiken bewust GEEN _ri(). De tabel
-- prep_item_ingredients heeft een trigger
-- (enforce_prep_item_ingredient_location_isolation) die eist dat het raw
-- ingredient hoort bij een locatie waar het prep item ook op de kaart staat.
-- _ri() geeft altijd de canonieke locatie (Mima Amsterdam) terug, en Turmeric
-- rice staat daar niet op de kaart -> de migratie klapte. Bovendien staan de
-- bestaande receptregels PER LOCATIE (Pickled cabbage 4x, Turmeric rice 3x);
-- met _ri() was het pekelvocht alleen bij Amsterdam in de kostprijs beland en
-- hadden Pijp, Zuidas en TEST stilzwijgend het oude recept gehouden.
-- Daarom joinen B en C op location_prep_items. Sectie A mag _ri() wel
-- gebruiken: menu_item_components kent geen locatie-trigger en alle bestaande
-- raw-componenten daar staan op één locatie.
-- ============================================================================
begin;

-- canonieke locatie: dezelfde die de bestaande componenten gebruiken -----------
create temporary table _loc as
select ri.location_id
from menu_item_components mic
join raw_ingredients ri on ri.id = mic.raw_ingredient_id
group by ri.location_id order by count(*) desc limit 1;

create or replace function _ri(p_name text) returns uuid language sql as $$
  select ri.id from raw_ingredients ri, _loc
  where ri.name = p_name and ri.location_id = _loc.location_id limit 1;
$$;

-- A. VERPAKKING ---------------------------------------------------------------
-- Bowls: 1100cc kraft bowl + deksel 185          = EUR 0,0614 + 0,1038
-- Pita:  1000cc kraft bowl + deksel 150          = EUR 0,0950 + 0,0746
-- Falafel mezze: 500cc kraft bowl + deksel 150   = EUR 0,0832 + 0,0746
-- Overige mezze: 350cc PP bak + PP deksel 115    = EUR 0,0561 + 0,0299
-- Soep: 450ml soup-to-go + deksel                = EUR 0,0704 + 0,0697
-- Chips: zak met venster                         = EUR 0,1620
-- Flatbread-gerechten: ersatzvel + sticker -> bewust NIET gemodelleerd (Marc)
-- Bestek en servetten -> bewust NIET meegeteld (Marc)
-- Brownie: papieren koekzak -> prijs ontbreekt nog, zie openstaand

insert into menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
select mi.id, _ri(v.pack), 1, v.pack, 900 + v.n
from menu_items mi
join (values
  ('Bowl Chicken','Bowl container',1),('Bowl Chicken','Lids (bowl)',2),
  ('Bowl Falafel','Bowl container',1),('Bowl Falafel','Lids (bowl)',2),
  ('Bowl Sabich','Bowl container',1),('Bowl Sabich','Lids (bowl)',2),
  ('Bowl Cauliflower','Bowl container',1),('Bowl Cauliflower','Lids (bowl)',2),
  ('Pita Chicken','Pita container',1),('Pita Chicken','Lids (pita)',2),
  ('Pita Falafel','Pita container',1),('Pita Falafel','Lids (pita)',2),
  ('Pita Sabich','Pita container',1),('Pita Sabich','Lids (pita)',2),
  ('Pita Cauliflower','Pita container',1),('Pita Cauliflower','Lids (pita)',2),
  ('Mezze Falafel','Falafel container',1),('Mezze Falafel','Lids (pita)',2),
  ('Mezze Hummus','Mezze container',1),('Mezze Hummus','Mezze lids',2),
  ('Mezze Tzatziki','Mezze container',1),('Mezze Tzatziki','Mezze lids',2),
  ('Mezze Baba ganoush','Mezze container',1),('Mezze Baba ganoush','Mezze lids',2),
  ('Mezze Aubergine','Mezze container',1),('Mezze Aubergine','Mezze lids',2),
  ('Mezze Cauliflower','Mezze container',1),('Mezze Cauliflower','Mezze lids',2),
  ('Mezze Grilled chicken','Mezze container',1),('Mezze Grilled chicken','Mezze lids',2),
  ('Lentil soup','Soup container',1),('Lentil soup','Soup lids',2),
  ('Flatbread chips','Flatbreadchips bags with window',1)
) as v(item, pack, n) on v.item = mi.name
where mi.active and _ri(v.pack) is not null
  and not exists (select 1 from menu_item_components x
                  where x.menu_item_id = mi.id and x.raw_ingredient_id = _ri(v.pack));

-- A2. KOEKZAK (EN5050) — brownie, losse flatbread, losse pita ----------------
-- Prijslijst GeDe 2026: EUR 4,86 per KG, ersatz 55 g/m2, formaat 140x(2x40)x305 mm
--   -> 0,220 x 0,305 m x 2 zijden = 0,1342 m2 = 7,38 g per zak
--   -> 135 zakken per kg -> EUR 0,0359 per zak (lijstprijs)
-- Controle: 135 zakken/kg x 10,7 kg = ca. 1450 zakken per doos. Klopt met de prijslijst.
insert into ingredient_prices (raw_ingredient_id, supplier_id, pack_size_grams, pack_size_label,
                               price_cents, price_includes_vat, effective_date, source, notes)
select ri.id, (select id from suppliers where name = 'GeDe' limit 1),
       1000, '1000 stuks, koekzak EN5050 (afgeleid: 7,38 g/zak bij 55 g/m2)',
       3590, false, current_date, 'GeDe prijslijst 2026, art EN5050',
       'Prijs is per kg (EUR 4,86); omgerekend naar EUR 0,0359 per zak op basis van formaat 140x(2x40)x305 mm en 55 g/m2.'
from raw_ingredients ri, _loc
where ri.name = 'Paper bag (brownies)' and ri.location_id = _loc.location_id
  and not exists (select 1 from ingredient_prices x where x.raw_ingredient_id = ri.id);

insert into menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
select mi.id, _ri('Paper bag (brownies)'), 1, 'Koekzak EN5050', 901
from menu_items mi
where mi.name in ('Brownie','Flatbread','Pita za''atar') and mi.active
  and _ri('Paper bag (brownies)') is not null
  and not exists (select 1 from menu_item_components x
                  where x.menu_item_id = mi.id and x.raw_ingredient_id = _ri('Paper bag (brownies)'));

-- OPTIONEEL — GeDe-nettoprijzen -----------------------------------------------
-- De prijslijst 2026 kent 2% handelskorting + 1% factuurkorting (cumulatief 2,98%).
-- De prijzen in de app zijn LIJSTprijzen. Onderstaande regel maakt ze netto.
-- Uitgecommentarieerd: zet aan als je netto wilt rekenen.
-- update ingredient_prices set price_cents = round(price_cents * 0.9702)
-- where supplier_id = (select id from suppliers where name = 'GeDe' limit 1)
--   and source like 'GeDe prijslijst 2026%';

-- B. PEKELVOCHT ---------------------------------------------------------------
-- 1 jerrycan (10 L) vult 5 bakken -> 2 L per bak van 3000 g groente.
-- Pekelrecept per 10 L: 2,5 L water + 10 el zout + 10 el suiker + 7,5 L azijn.
-- Per 2 L: 1500 g azijn, 36 g zout, 25 g suiker (water gratis).
-- Al het vocht wordt weggegooid -> volledige kosten toerekenen, groente-yield 100%.
insert into prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
select pi.id, ri.id, v.qty
from prep_items pi
join (values
  ('Pickled cabbage','Vinegar',1500),('Pickled cabbage','Salt',36),('Pickled cabbage','Sugar white',25),
  ('Pickled onion','Vinegar',1500),('Pickled onion','Salt',36),('Pickled onion','Sugar white',25)
) as v(prep, ing, qty) on v.prep = pi.name
join location_prep_items lpi on lpi.prep_item_id = pi.id
join raw_ingredients ri on ri.location_id = lpi.location_id and ri.name = v.ing
where not exists (select 1 from prep_item_ingredients x
                  where x.prep_item_id = pi.id and x.raw_ingredient_id = ri.id);

update prep_items set yield_note = concat_ws(' ', yield_note,
  'Pekelvocht toegevoegd (2 L per bak van 3 kg groente): azijn 1500 g, zout 36 g, suiker 25 g. Vocht wordt volledig weggegooid, dus volledige kosten toegerekend en groente-yield blijft 100%.')
where name in ('Pickled cabbage','Pickled onion');

-- C. TURMERIC RICE ------------------------------------------------------------
-- Bowl-base op Pijp en Zuidas. Nu stond alleen peterselie in het recept.
-- Receptenboek, per batch van 2,8 kg output; el = 15 ml.
insert into prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
select pi.id, ri.id, v.qty
from prep_items pi
join (values
  ('Turmeric rice','Rice parboiled',1000),
  ('Turmeric rice','Turmeric',18),
  ('Turmeric rice','Cumin',9),
  ('Turmeric rice','Salt',18),
  ('Turmeric rice','Black pepper',3),
  ('Turmeric rice','Sunflower oil',82),
  ('Turmeric rice','Stock',40)
) as v(prep, ing, qty) on v.prep = pi.name
join location_prep_items lpi on lpi.prep_item_id = pi.id
join raw_ingredients ri on ri.location_id = lpi.location_id and ri.name = v.ing
where not exists (select 1 from prep_item_ingredients x
                  where x.prep_item_id = pi.id and x.raw_ingredient_id = ri.id);

update prep_items set
  ingredient_qty_is_per_recipe_batch = true,
  recipe_output_amount = 2800, recipe_output_unit = 'g',
  yield_source = 'estimated',
  yield_note = 'Volledige receptuur toegevoegd 01-09-2026 (stond alleen peterselie). Parboiled rice per Marc. Water 1,7 L gratis. Output 2800 g = 1 GN 1/3 volgens boek — wegen.'
where name = 'Turmeric rice';

-- D. BLOEMKOOLCOATING ---------------------------------------------------------
-- Marc: verhouding is 2 cups spicemix : 3 cups rijstbloem (NIET spicemix:bloemkool),
-- en nagenoeg alles blijft plakken. De HOEVEELHEID coating per batch bloemkool is
-- nog onbekend -> Hadi weegt dit ("Coating used (g)" in het meetprotocol).
-- Zodra dat getal er is: rijstbloem = 0,6 x coatinggewicht, spicemix = 0,4 x.
update prep_items set yield_note = concat_ws(' ', yield_note,
  'OPEN: coating = 2 delen spicemix op 3 delen rijstbloem (Marc 01-09-2026), nagenoeg alles blijft plakken. Hoeveelheid per batch nog te meten; daarna rijstbloem 60% / spicemix 40% van het gemeten coatinggewicht toevoegen. Roosterverlies ook nog te meten.')
where name = 'Coated Cauliflower';

-- E. NIEUWE MENU-ITEMS --------------------------------------------------------
-- Deze drie worden wel verkocht in Butlaroo maar bestonden niet in de app.
insert into menu_items (name, category, subcategory, price_cents, active, display_order)
select v.naam, v.cat, v.subcat, v.prijs, true, v.volgorde
from (values
  ('Mediterranean pickles','side','pickles',195,60),
  ('Shifka peppers','side','pickles',195,61),
  ('Coca-Cola Zero','drink',null,295,62)
) as v(naam, cat, subcat, prijs, volgorde)
where not exists (select 1 from menu_items m where m.name = v.naam);

insert into menu_item_components (menu_item_id, prep_item_id, quantity_grams, display_order)
select mi.id, pi.id, v.gram, 1
from menu_items mi
join (values ('Mediterranean pickles','Mediterranean pickles',60),
             ('Shifka peppers','Shifka peppers',40)) as v(item, prep, gram) on v.item = mi.name
join prep_items pi on pi.name = v.prep
where not exists (select 1 from menu_item_components x where x.menu_item_id = mi.id);

-- 329 g = een blikje. De inkoopprijs staat per tray: "Tray 24 x 33CL (7.90 kg)"
-- = 7896 g voor 24 blikjes. Met quantity_grams = 1 zou de cola op EUR 0,00
-- uitkomen in plaats van EUR 0,90, want de view rekent per gram.
insert into menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, display_order)
select mi.id, _ri('Coca Cola Zero'), 329, 1
from menu_items mi where mi.name = 'Coca-Cola Zero' and _ri('Coca Cola Zero') is not null
  and not exists (select 1 from menu_item_components x where x.menu_item_id = mi.id);

-- kanaalprijzen: bezorging = instore + opslag zoals bij vergelijkbare items
insert into menu_item_channel_prices (menu_item_id, channel, price_cents, price_includes_vat)
select mi.id, ch.channel, mi.price_cents + ch.opslag, true
from menu_items mi
join (values ('instore',0),('thuisbezorgd',50),('uber_eats',50)) as ch(channel, opslag) on true
where mi.name in ('Mediterranean pickles','Shifka peppers','Coca-Cola Zero')
  and not exists (select 1 from menu_item_channel_prices x
                  where x.menu_item_id = mi.id and x.channel = ch.channel);

drop function _ri(text);

-- Controle --------------------------------------------------------------------
select menu_item_name, round(computed_cost_cents/100.0,2) as cogs_eur, food_cost_pct, missing_price_lines
from computed_menu_item_food_cost where computed_cost_cents > 0 order by menu_item_name;

commit;
