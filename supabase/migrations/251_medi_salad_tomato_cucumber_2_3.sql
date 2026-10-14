-- ============================================================================
-- Migration 251: Medi salad recipe, tomato : cucumber = 2 : 3
--
-- The canonical recipe had the ratio the wrong way round: 2 205 g tomato
-- brunoise against 1 470 g cucumber (3 : 2). The recipe is 2 parts tomato to
-- 3 parts cucumber (Marc, 14-10-2026; managers earlier described it as
-- "3 crates cucumber : 1 crate tomato"). The test of migration 250 showed it:
-- West ordered about a third of the tomato the old recipe predicted.
--
-- Same total vegetable weight, so the batch output (3 200 g) and the
-- parsley line stay as they are. Only the canonical lines (Mima Amsterdam)
-- change; recipes are global.
--
-- Note for the ordering learning loop: the West multipliers on tomato
-- brunoise (0.5) and cucumber (1.0) were partly compensating for this error.
-- Reassess them in the next Monday round (rule 3d: recipe change).
-- ============================================================================
begin;

update prep_item_ingredients pii
set quantity_per_unit = case lower(btrim(ri.name))
      when 'tomato brunoise 20mm (1 kg)' then 1470
      when 'cucumber' then 2205
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
  if t is distinct from 1470 or c is distinct from 2205 then
    raise exception 'Medi salad canonical lines not as expected: tomato %, cucumber %', t, c;
  end if;
end $$;

commit;
