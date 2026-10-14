-- ============================================================================
-- Migration 251: Medi salad recipe, tomato : cucumber = 2 : 3
--
-- The canonical recipe had the ratio the wrong way round: 2 205 g tomato
-- brunoise against 1 470 g cucumber (3 : 2). The recipe is 2 parts tomato to
-- 3 parts cucumber. Source: Recipe book v1.0 (30-07-2026), p. 30, checked
-- 14-10-2026: one batch = 20 kg diced tomato + 84 cucumbers + a handful of
-- parsley, yield 15 containers (1/3 GN). The app's prep unit is one container
-- (content 3 200 g), so per container:
--   tomato    20 000 g / 15             = 1 333 g
--   cucumber  84 x 350 g (grams_per_piece in the app) / 15 = 1 960 g
-- 3 293 g in for 3 200 g out (97%, cucumber ends), in line with the near
-- 100% Sergey measured at West. Parsley (15 g) stays as it is.
-- Only the canonical lines (Mima Amsterdam) change; recipes are global.
--
-- Note for the ordering learning loop: the West multipliers on tomato
-- brunoise (0.5) and cucumber (1.0) were partly compensating for this error.
-- Reassess them in the next Monday round (rule 3d: recipe change).
-- ============================================================================
begin;

update prep_item_ingredients pii
set quantity_per_unit = case lower(btrim(ri.name))
      when 'tomato brunoise 20mm (1 kg)' then 1333
      when 'cucumber' then 1960
    end,
    updated_at = now()
from raw_ingredients ri, prep_items p, locations l
where ri.id = pii.raw_ingredient_id
  and p.id = pii.prep_item_id
  and l.id = ri.location_id
  and l.is_canonical
  and p.name = 'Mediterranean salad / Medi salad'
  and lower(btrim(ri.name)) in ('tomato brunoise 20mm (1 kg)', 'cucumber');

do $$
declare t numeric; c numeric;
begin
  select max(quantity_per_unit) filter (where ingredient_key = 'tomato brunoise 20mm (1 kg)'),
         max(quantity_per_unit) filter (where ingredient_key = 'cucumber')
    into t, c
  from prep_recipe_lines_canonical l join prep_items p on p.id = l.prep_item_id
  where p.name = 'Mediterranean salad / Medi salad';
  if t is distinct from 1333 or c is distinct from 1960 then
    raise exception 'Medi salad canonical lines not as expected: tomato %, cucumber %', t, c;
  end if;
end $$;

commit;
