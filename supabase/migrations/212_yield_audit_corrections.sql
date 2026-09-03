-- ============================================================================
-- Migratie 212 — yield-provenance + correcties uit de kostprijsaudit 01-09-2026
-- Alle oude waarden staan in yield_note, zodat elke stap terug te draaien is.
-- Draai als één transactie; de laatste SELECT toont het resultaat.
-- ============================================================================
begin;

-- 1. Herkomst van elke yield vastleggen -------------------------------------
alter table prep_items add column if not exists yield_source text
  check (yield_source in ('measured','estimated','assumed'));
alter table prep_items add column if not exists yield_measured_at date;
alter table prep_items add column if not exists yield_note text;

comment on column prep_items.yield_source is
  'measured = batch in/uit gewogen; estimated = onderbouwde schatting; assumed = output nooit gevalideerd';

update prep_items set yield_source = 'assumed' where yield_source is null;

-- 2. GEMETEN — Grilled chicken ----------------------------------------------
-- 9656 g rauw -> 6018 g gegaard = 62,32%  (was 10000 -> 10000 = 100%)
update prep_items set
  recipe_output_amount = 6232,
  recipe_output_unit   = 'g',
  yield_source         = 'measured',
  yield_note           = 'Gemeten: 9656 g rauw -> 6018 g gegaard = 62,32% (bak 1: 61,7%, bak 2: 63,0%). Was 10000 g (100%). Meetdatum onbekend — herhalen en yield_measured_at vullen.'
where name = 'Grilled chicken';

-- 3. GESCHAT — Aubergine/Sabich (gezouten, uitgelekt, gefrituurd) ------------
update prep_items set
  recipe_output_amount = 1690,
  recipe_output_unit   = 'g',
  yield_source         = 'estimated',
  yield_note           = 'Schatting 65% van 2600 g rauw. Was 2800 g (108%) — dat was de bakinhoud, geen yield. WEGEN.'
where name = 'Aubergine / Sabich';

-- 4. GESCHAT — Lettuce (schoonmaak- en snijverlies) -------------------------
update prep_items set
  recipe_output_amount = 2940,
  recipe_output_unit   = 'g',
  yield_source         = 'estimated',
  yield_note           = 'Schatting 70% van 4200 g. Was 5400 g (129%, onmogelijk). WEGEN.'
where name = 'Lettuce';

-- 5. Ingredient-state: boek noemt gekookt/geweekt, prijs is droog product ----
update prep_item_ingredients pii set quantity_per_unit = 1600
from prep_items pi, raw_ingredients ri
where pii.prep_item_id = pi.id and pii.raw_ingredient_id = ri.id
  and pi.name = 'Hummus' and ri.name = 'Chickpeas';

update prep_items set yield_note = concat_ws(' ', yield_note,
  'Kikkererwten 4000 -> 1600 g: boek zegt 4 kg GEKOOKT, prijs is het droge product (factor 2,5 uit eigen kookrecept 10 kg -> 25 kg).')
where name = 'Hummus';

update prep_item_ingredients pii set quantity_per_unit = 2714
from prep_items pi, raw_ingredients ri
where pii.prep_item_id = pi.id and pii.raw_ingredient_id = ri.id
  and pi.name = 'Falafel' and ri.name = 'Chickpeas';

update prep_items set yield_note = concat_ws(' ', yield_note,
  'Kikkererwten 5700 -> 2714 g: boek zegt 5,7 kg GEWEEKT, prijs is het droge product (weekfactor 2,1 — verifieren). Frituurverlies zit nog niet in de output.')
where name = 'Falafel';

-- 6. Flatbread chips: receptregels zijn per 3 zakken, noemer stond op 1 zak --
update prep_items set
  ingredient_qty_is_per_recipe_batch = true,
  recipe_output_amount = 300,
  recipe_output_unit   = 'g',
  yield_source         = 'estimated',
  yield_note           = 'Recept is per 3 zakken (3 flatbreads, 3 el zaatar, 1 tl zout) maar de noemer stond op 1 zak -> alles telde 3x mee. Noemer nu 300 (3 x 100). Zak zelf zit nog niet in de kostprijs.'
where name = 'Za''atar flatbread chips';

update menu_item_components mic set quantity_grams = 100
from menu_items mi, prep_items pi
where mic.menu_item_id = mi.id and mic.prep_item_id = pi.id
  and mi.name = 'Flatbread chips' and pi.name = 'Za''atar flatbread chips';

-- 7. Pita weegt 110 g (doos 50 st a 110 g), niet 100 g ----------------------
update menu_item_components mic set quantity_grams = 110
from raw_ingredients ri
where mic.raw_ingredient_id = ri.id
  and ri.name = 'Pita bread 15 cm' and mic.quantity_grams = 100;

-- Controle -----------------------------------------------------------------
select menu_item_name,
       round(computed_cost_cents/100.0, 2) as cogs_eur,
       food_cost_pct as pct_op_prijs_incl_btw
from computed_menu_item_food_cost
where computed_cost_cents > 0
order by menu_item_name;

commit;
