-- 241: separate yield for cost price vs. ordering/prep (Marc, 28-09-2026)
--
-- recipe_output_amount drives the ordering suggestion, the prep list and nutrition.
-- Migration 228 set Aubergine / Sabich to 884 g (34 %) so the cost price reflects the real
-- loss, but ordering then needed ~2x aubergine (42 kg/day, 10 crates at Pijp).
-- Now: cost_recipe_output_amount (same unit as recipe_output_unit) is used only by
-- fn_prep_cost_per_gram; NULL = same as recipe_output_amount.

begin;

alter table prep_items add column if not exists cost_recipe_output_amount numeric;
comment on column prep_items.cost_recipe_output_amount is
  'Yield used for cost price only (incl. real loss), in recipe_output_unit. NULL = recipe_output_amount. Ordering, prep list and nutrition keep recipe_output_amount.';

create or replace function public.fn_prep_cost_denominator_grams(p prep_items)
returns numeric language sql immutable as $$
  select case
    when coalesce(p.ingredient_qty_is_per_recipe_batch, false) and p.cost_recipe_output_amount is not null then
      case lower(coalesce(p.recipe_output_unit, 'g'))
        when 'kg' then p.cost_recipe_output_amount * 1000
        when 'g'  then p.cost_recipe_output_amount
        when 'l'  then p.cost_recipe_output_amount * 1000
        when 'ml' then p.cost_recipe_output_amount
        else 0 end
    else fn_prep_denominator_grams(p) end;
$$;

create or replace function public.fn_prep_cost_per_gram(p_prep_item_id uuid, p_depth integer default 0)
 returns table(cents_per_gram numeric, missing_price boolean, n_lines integer)
 language plpgsql stable
as $function$
DECLARE pi prep_items%ROWTYPE; r record; v_ppg numeric; sub record; den numeric; total numeric := 0; v_missing boolean := false; n int := 0;
BEGIN
  IF p_depth > 6 THEN RETURN QUERY SELECT NULL::numeric, true, 0; RETURN; END IF;
  SELECT * INTO pi FROM prep_items WHERE id = p_prep_item_id;
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::numeric, true, 0; RETURN; END IF;
  den := fn_prep_cost_denominator_grams(pi);
  FOR r IN SELECT * FROM prep_recipe_lines_canonical WHERE prep_item_id = p_prep_item_id LOOP
    n := n + 1;
    IF r.sub_prep_item_id IS NOT NULL THEN
      SELECT * INTO sub FROM fn_prep_cost_per_gram(r.sub_prep_item_id, p_depth + 1);
      IF sub.cents_per_gram IS NULL THEN v_missing := true; ELSE total := total + r.quantity_per_unit * sub.cents_per_gram; END IF;
      v_missing := v_missing OR sub.missing_price;
    ELSE
      SELECT p.price_cents_per_gram INTO v_ppg FROM ingredient_current_prices p WHERE p.raw_ingredient_id = r.raw_ingredient_id AND p.price_cents_per_gram IS NOT NULL
        ORDER BY p.effective_date DESC LIMIT 1;
      IF v_ppg IS NULL THEN
        SELECT price_cents_per_gram INTO v_ppg FROM ingredient_current_price_by_name WHERE ingredient_key = r.ingredient_key;
      END IF;
      IF v_ppg IS NULL THEN v_missing := true; ELSE total := total + r.quantity_per_unit * v_ppg; END IF;
    END IF;
  END LOOP;
  IF n = 0 OR den IS NULL OR den <= 0 THEN RETURN QUERY SELECT NULL::numeric, true, n; RETURN; END IF;
  RETURN QUERY SELECT round(total/den, 6), v_missing, n;
END $function$;

-- Sabich: cost keeps the 34 % (884 g), ordering/prep go back to the 65 % estimate (1690 g, migration 212).
update prep_items set
  cost_recipe_output_amount = 884,
  recipe_output_amount = 1690,
  yield_note = 'Ordering/prep: estimate 65% of 2600 g raw (1690 g). Cost price: 884 g (34%, incl. real loss; migration 228) in cost_recipe_output_amount. Was 884 g for both until 28-09-2026. Measure (Hadi protocol P1).',
  updated_at = now()
where name = 'Aubergine / Sabich' and recipe_output_amount = 884;

-- Check: cost price unchanged (1.086190 c/g before), ordering yield 1690 g.
select pi.name, pi.recipe_output_amount, pi.cost_recipe_output_amount, c.cents_per_gram
from prep_items pi, fn_prep_cost_per_gram(pi.id) c
where pi.name = 'Aubergine / Sabich';

commit;
