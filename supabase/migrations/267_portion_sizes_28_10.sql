-- ============================================================================
-- Migration 267: new portion sizes (Marc, 28-10-2026)
--
-- Decided 28-10-2026 after weighing portions again. Cost price and nutrition
-- views (computed_menu_item_*) follow automatically from these grams.
--
--   Tzatziki ladle in Bowl / Flatbread / Pita Chicken   40 g -> 50 g
--   Aubergine / Sabich in Flatbread Sabich, Pita Sabich 70 g -> 80 g
--   Aubergine / Sabich in Bowl Sabich                   80 g -> 90 g
--   Coated Cauliflower in Mezze Cauliflower            200 g -> 130 g
--   Grilled chicken in Mezze Grilled chicken           200 g -> 180 g
--
-- Not changed: Tzatziki side (41 g sauce cup), Mezze Tzatziki (210 g),
-- Mezze Aubergine (200 g), chicken and cauliflower in bowls/flatbreads/pitas.
-- Idempotent: each update only touches the row if it still differs.
-- ============================================================================
begin;

with target(menu_item, prep_item, new_grams) as (values
  ('Bowl Chicken',          'Tzatziki',           50),
  ('Flatbread Chicken',     'Tzatziki',           50),
  ('Pita Chicken',          'Tzatziki',           50),
  ('Flatbread Sabich',      'Aubergine / Sabich', 80),
  ('Pita Sabich',           'Aubergine / Sabich', 80),
  ('Bowl Sabich',           'Aubergine / Sabich', 90),
  ('Mezze Cauliflower',     'Coated Cauliflower', 130),
  ('Mezze Grilled chicken', 'Grilled chicken',    180)
)
update menu_item_components c
set quantity_grams = t.new_grams
from target t
join menu_items mi on mi.name = t.menu_item
join prep_items p on p.name = t.prep_item
where c.menu_item_id = mi.id
  and c.prep_item_id = p.id
  and c.quantity_grams is distinct from t.new_grams;

commit;

-- Check
select mi.name as menu_item, p.name as prep_item, c.quantity_grams
from menu_item_components c
join menu_items mi on mi.id = c.menu_item_id
join prep_items p on p.id = c.prep_item_id
where (mi.name, p.name) in (
  ('Bowl Chicken','Tzatziki'), ('Flatbread Chicken','Tzatziki'), ('Pita Chicken','Tzatziki'),
  ('Flatbread Sabich','Aubergine / Sabich'), ('Pita Sabich','Aubergine / Sabich'), ('Bowl Sabich','Aubergine / Sabich'),
  ('Mezze Cauliflower','Coated Cauliflower'), ('Mezze Grilled chicken','Grilled chicken'))
order by 2, 1;
