-- ============================================================================
-- Migration 250: Butlaroo sales feed and theoretical usage
--
-- Phase 1 of "sales-driven ordering" (Feedback loop rules, section 6).
-- Nothing in this migration changes the order suggestion, the prep list or
-- any ordering parameter. It only adds:
--
--   1. Two feed tables, filled nightly by push_pos_sales.py in the
--      MarcMima/mima-data repo (same pattern as channel_mix and base_mix):
--        pos_sales_daily          units sold per location, day, product
--        pos_sales_variant_daily  chosen bowl bases, add-ons, toppings, bread
--   2. pos_variant_effects: what an add-on, topping or bread choice puts on
--      the plate, in grams of a prep item or raw ingredient. Seeded with
--      ASSUMED portions (basis = 'assumed') until Hadi confirms them.
--   3. Views that turn sales into theoretical raw ingredient usage, a
--      theoretical food cost per week, and a weekly test of theoretical
--      usage against what was ordered.
--
-- Product mapping (Butlaroo name -> app menu item) is NOT repeated here: its
-- single home is gold.dim_product_map in mima-data. The push resolves the
-- menu item before writing, so menu_item_id arrives filled in.
--
-- Units: everything is in grams (or ml, or pieces for packaging), the same
-- convention as the cost model (ingredient_prices.pack_size_grams). Waste is
-- added as the standard 10% only in the cost and test views, and named there.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Feed tables
-- ---------------------------------------------------------------------------
create table if not exists pos_sales_daily (
  location_id        uuid not null references locations(id) on delete cascade,
  date               date not null,
  pos_product_name   text not null,
  channel_group      text not null default 'unknown',
  menu_item_id       uuid references menu_items(id) on delete set null,
  quantity           numeric not null,
  free_quantity      numeric not null default 0,
  net_revenue_cents  integer not null default 0,
  source             text not null default 'butlaroo',
  loaded_at          timestamptz not null default now(),
  primary key (location_id, date, pos_product_name, channel_group)
);

comment on table pos_sales_daily is
  'Units sold per location, day, POS product and channel group. Filled nightly from '
  'mima-data (push_pos_sales.py); the app only reads. menu_item_id is resolved via '
  'gold.dim_product_map and is NULL for products without a recipe (e.g. SOOF, teas). '
  'quantity includes free (EUR 0) lines, because that food also leaves the kitchen; '
  'free_quantity shows how many of them were free.';

create index if not exists pos_sales_daily_date_idx on pos_sales_daily (date);
create index if not exists pos_sales_daily_item_idx on pos_sales_daily (menu_item_id);

create table if not exists pos_sales_variant_daily (
  location_id       uuid not null references locations(id) on delete cascade,
  date              date not null,
  pos_product_name  text not null,
  variant_role      text not null check (variant_role in ('base_combo','add_on','topping','bread')),
  variant_name      text not null,
  menu_item_id      uuid references menu_items(id) on delete set null,
  quantity          numeric not null,
  loaded_at         timestamptz not null default now(),
  primary key (location_id, date, pos_product_name, variant_role, variant_name)
);

comment on table pos_sales_variant_daily is
  'Choices made per product per day. variant_role base_combo carries the bowl base '
  'COMBINATION as the bowl_base_options slug (e.g. hummus_mudardara), one per bowl; '
  'add_on, topping and bread carry the Butlaroo variant name. Filled by push_pos_sales.py.';

create index if not exists pos_sales_variant_daily_date_idx on pos_sales_variant_daily (date);

-- ---------------------------------------------------------------------------
-- 2. What a variant puts on the plate
-- ---------------------------------------------------------------------------
create table if not exists pos_variant_effects (
  id              uuid primary key default gen_random_uuid(),
  variant_role    text not null check (variant_role in ('add_on','topping','bread')),
  variant_name    text not null,
  menu_item_name  text,
  component_kind  text not null check (component_kind in ('prep','raw')),
  component_name  text not null,
  quantity_grams  numeric not null,
  basis           text not null default 'assumed' check (basis in ('assumed','confirmed')),
  note            text,
  updated_at      timestamptz not null default now()
);

comment on table pos_variant_effects is
  'Grams of a prep item or raw ingredient that one unit of a POS variant adds (or, '
  'negative, removes). menu_item_name NULL = applies to every dish; a row with a '
  'menu_item_name overrides the generic rows for that dish. basis = assumed until '
  'Hadi has confirmed the portion.';

create unique index if not exists pos_variant_effects_uniq
  on pos_variant_effects (variant_role, lower(variant_name), coalesce(menu_item_name, ''),
                          component_kind, lower(component_name));

insert into pos_variant_effects
  (variant_role, variant_name, menu_item_name, component_kind, component_name, quantity_grams, note)
values
  -- Add-ons: one portion each. All ASSUMED, to be confirmed by Hadi.
  ('add_on', 'Chicken',               null, 'prep', 'Grilled chicken',                60, 'half a dish portion (120 g)'),
  ('add_on', 'Falafel',               null, 'prep', 'Falafel',                        60, 'half a dish portion (120 g)'),
  ('add_on', 'Cauliflower Shawarma',  null, 'prep', 'Coated Cauliflower',             50, 'half a dish portion (100-110 g)'),
  ('add_on', 'Aubergine',             null, 'prep', 'Aubergine / Sabich',             40, 'about half a dish portion'),
  ('add_on', 'Egg',                   null, 'raw',  'Eggs',                           60, 'one egg, as in the Sabich dishes'),
  ('add_on', 'Feta',                  null, 'prep', 'Feta',                           30, null),
  ('add_on', 'Tzatziki - Yoghurt',    null, 'prep', 'Tzatziki',                       40, 'same as in the chicken dishes'),
  ('add_on', 'Hummus',                null, 'prep', 'Hummus',                         50, 'same as in pita and flatbread'),
  ('add_on', 'Tarator - Tahini',      null, 'prep', 'Tarator',                        25, 'same as in the dishes'),
  ('add_on', 'Amba - Mango',          null, 'prep', 'Amba',                           25, 'same as in the Sabich dishes'),
  ('add_on', 'Schug - Spicy',         null, 'prep', 'Srug',                           20, null),
  ('add_on', 'S''rug - Spicy',        null, 'prep', 'Srug',                           20, 'old Butlaroo spelling'),
  ('add_on', 'Pickled Onion',         null, 'prep', 'Pickled onion',                  30, null),
  ('add_on', 'Pickled Cabbage',       null, 'prep', 'Pickled cabbage',                40, null),
  ('add_on', 'Mediterranean Pickles', null, 'prep', 'Mediterranean pickles',          40, null),
  ('add_on', 'Shifka Peppers',        null, 'prep', 'Shifka peppers',                 20, 'same as the side portion'),
  ('add_on', 'Kalamata Olives',       null, 'prep', 'Olives',                         30, null),
  ('add_on', 'Pomegranate Seeds',     null, 'prep', 'Pomegranate',                    15, 'same as in the cauliflower dishes'),
  ('add_on', 'Parsley',               null, 'prep', 'Parsley',                         2, null),
  ('add_on', 'Fresh Mint',            null, 'prep', 'Mint',                            2, null),
  ('add_on', 'Romaine Lettuce',       null, 'prep', 'Lettuce',                        40, 'as in a two-base bowl'),
  ('add_on', 'Mudardara',             null, 'prep', 'Mudardara',                     120, 'as in a two-base bowl'),
  ('add_on', 'Turmeric Rice',         null, 'prep', 'Turmeric rice',                 120, 'as in a two-base bowl'),
  -- Soup toppings.
  ('topping', 'Feta',                 null, 'prep', 'Feta',                           20, 'soup topping'),
  ('topping', 'Schug',                null, 'prep', 'Srug',                           10, 'soup topping'),
  ('topping', 'S''rug',               null, 'prep', 'Srug',                           10, 'soup topping, old spelling'),
  -- Bread: wholewheat swaps the white pita for the wholewheat one.
  ('bread', 'Wholewheat', null,            'raw',  'Pita bread 15 cm',             -110, 'swap: remove white pita'),
  ('bread', 'Wholewheat', null,            'raw',  'Whole wheat pita bread 15 cm',  110, 'swap: add wholewheat pita'),
  ('bread', 'Wholewheat', 'Pita za''atar', 'prep', 'Regular pita with za''atar',   -113, 'swap: remove white za''atar pita'),
  ('bread', 'Wholewheat', 'Pita za''atar', 'prep', 'Wholewheat pita with za''atar', 113, 'swap: add wholewheat za''atar pita')
on conflict do nothing;

-- Fail loudly if a seeded name does not exist, instead of silently counting 0.
do $$
declare missing text;
begin
  select string_agg(distinct e.component_kind || ':' || e.component_name, ', ') into missing
  from pos_variant_effects e
  where (e.component_kind = 'prep' and not exists (
           select 1 from prep_items p where lower(btrim(p.name)) = lower(btrim(e.component_name))))
     or (e.component_kind = 'raw' and not exists (
           select 1 from raw_ingredients r where lower(btrim(r.name)) = lower(btrim(e.component_name))));
  if missing is not null then
    raise exception 'pos_variant_effects refers to unknown components: %', missing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Explosion views: grams of raw ingredient per gram, per dish, per base
-- ---------------------------------------------------------------------------

-- Raw grams per gram of prep item, through sub-preps (max depth 6). Uses the
-- same canonical recipe lines and the same denominator as the cost model
-- (fn_prep_cost_per_gram), so usage and cost always agree. cost_only lines
-- (e.g. pickling liquid that is poured away) are included: they are bought.
create or replace view v_prep_raw_per_gram as
with recursive den as (
  select p.id as prep_item_id, nullif(fn_prep_cost_denominator_grams(p), 0) as d
  from prep_items p
), lines as (
  select l.prep_item_id, l.sub_prep_item_id, l.ingredient_key, l.ingredient_name,
         l.quantity_per_unit / den.d as per_g
  from prep_recipe_lines_canonical l
  join den on den.prep_item_id = l.prep_item_id
  where den.d is not null
), walk as (
  select prep_item_id as root, sub_prep_item_id, ingredient_key, ingredient_name, per_g, 1 as depth
  from lines
  union all
  select w.root, l.sub_prep_item_id, l.ingredient_key, l.ingredient_name, w.per_g * l.per_g, w.depth + 1
  from walk w
  join lines l on l.prep_item_id = w.sub_prep_item_id
  where w.depth < 6
)
select root as prep_item_id, ingredient_key, min(ingredient_name) as ingredient_name,
       sum(per_g) as raw_g_per_g
from walk
where sub_prep_item_id is null and ingredient_key is not null
group by root, ingredient_key;

comment on view v_prep_raw_per_gram is
  'Grams of each raw ingredient in one gram of a prep item (yield included, sub-preps '
  'unfolded). Same recipe lines and denominator as the cost model.';

-- Raw grams per unit sold of a menu item, EXCLUDING the bowl base (that comes
-- from the recorded base combination, see v_bowl_base_raw_per_bowl).
create or replace view v_menu_item_raw_per_unit as
with comps as (
  select mic.menu_item_id, mic.prep_item_id, mic.raw_ingredient_id, mic.quantity_grams::numeric as g
  from menu_item_components mic
  where mic.option_group is distinct from 'base'
)
select menu_item_id, ingredient_key, min(ingredient_name) as ingredient_name, sum(grams) as grams
from (
  select c.menu_item_id, r.ingredient_key, r.ingredient_name, c.g * r.raw_g_per_g as grams
  from comps c join v_prep_raw_per_gram r on r.prep_item_id = c.prep_item_id
  union all
  select c.menu_item_id, lower(btrim(ri.name)), ri.name, c.g
  from comps c join raw_ingredients ri on ri.id = c.raw_ingredient_id
) x
group by menu_item_id, ingredient_key;

-- Raw grams per bowl for each base combination (bowl_base_options.name).
create or replace view v_bowl_base_raw_per_bowl as
select bo.name as base_name, r.ingredient_key, min(r.ingredient_name) as ingredient_name,
       sum(bbc.quantity_grams * r.raw_g_per_g) as grams
from bowl_base_options bo
join bowl_base_components bbc on bbc.base_option_id = bo.id
join v_prep_raw_per_gram r on r.prep_item_id = bbc.prep_item_id
group by bo.name, r.ingredient_key;

-- Raw grams per unit of a variant (signed: a swap removes as well as adds).
create or replace view v_pos_variant_raw_per_unit as
select e.variant_role, lower(btrim(e.variant_name)) as variant_key, e.menu_item_name,
       x.ingredient_key, min(x.ingredient_name) as ingredient_name, sum(x.grams) as grams,
       bool_or(e.basis = 'assumed') as any_assumed
from pos_variant_effects e
cross join lateral (
  select r.ingredient_key, r.ingredient_name, e.quantity_grams * r.raw_g_per_g as grams
  from prep_items p join v_prep_raw_per_gram r on r.prep_item_id = p.id
  where e.component_kind = 'prep' and lower(btrim(p.name)) = lower(btrim(e.component_name))
  union all
  select lower(btrim(e.component_name)), e.component_name, e.quantity_grams
  where e.component_kind = 'raw'
) x
group by e.variant_role, lower(btrim(e.variant_name)), e.menu_item_name, x.ingredient_key;

-- ---------------------------------------------------------------------------
-- 4. Theoretical usage from sales
-- ---------------------------------------------------------------------------
create or replace view v_theoretical_raw_usage_lines as
with bowl_items as (
  select distinct menu_item_id from menu_item_components where option_group = 'base'
), base_recorded as (
  select location_id, date, menu_item_id, sum(quantity) as bowls
  from pos_sales_variant_daily where variant_role = 'base_combo'
  group by 1, 2, 3
), bowls_sold as (
  select s.location_id, s.date, s.menu_item_id, sum(s.quantity) as bowls
  from pos_sales_daily s join bowl_items b on b.menu_item_id = s.menu_item_id
  group by 1, 2, 3
)
-- A. the dish itself, without its base
select s.location_id, s.date, 'dish'::text as source, u.ingredient_key, u.ingredient_name,
       s.quantity * u.grams as grams
from pos_sales_daily s
join v_menu_item_raw_per_unit u on u.menu_item_id = s.menu_item_id
union all
-- B. recorded bowl base combinations
select v.location_id, v.date, 'base', b.ingredient_key, b.ingredient_name, v.quantity * b.grams
from pos_sales_variant_daily v
join v_bowl_base_raw_per_bowl b on b.base_name = v.variant_name
where v.variant_role = 'base_combo'
union all
-- C. bowls without a recorded base: the location-independent average mix
select bs.location_id, bs.date, 'base_unrecorded', b.ingredient_key, b.ingredient_name,
       (bs.bowls - coalesce(br.bowls, 0)) * w.weight * b.grams
from bowls_sold bs
left join base_recorded br using (location_id, date, menu_item_id)
join bowl_base_weights w on w.menu_item_id = bs.menu_item_id
join v_bowl_base_raw_per_bowl b on b.base_name = w.base_name
where bs.bowls - coalesce(br.bowls, 0) > 0
union all
-- D. add-ons, toppings and bread; a dish-specific rule beats the generic one
select v.location_id, v.date, 'variant', e.ingredient_key, e.ingredient_name, v.quantity * e.grams
from pos_sales_variant_daily v
join menu_items mi on mi.id = v.menu_item_id
join v_pos_variant_raw_per_unit e
  on e.variant_role = v.variant_role
 and e.variant_key = lower(btrim(v.variant_name))
 and (e.menu_item_name = mi.name
      or (e.menu_item_name is null and not exists (
            select 1 from pos_variant_effects x
            where x.variant_role = v.variant_role
              and lower(btrim(x.variant_name)) = lower(btrim(v.variant_name))
              and x.menu_item_name = mi.name)))
where v.variant_role <> 'base_combo';

comment on view v_theoretical_raw_usage_lines is
  'Theoretical raw usage per location and day, split by source: dish, base (recorded '
  'combination), base_unrecorded (average mix), variant (add-ons, toppings, bread). '
  'Grams, WITHOUT waste.';

create or replace view v_theoretical_raw_usage_daily as
select u.location_id, u.date, u.ingredient_key, min(u.ingredient_name) as ingredient_name,
       ri.id as raw_ingredient_id, ri.item_kind,
       sum(u.grams) as grams,
       sum(u.grams) * 1.10 as grams_incl_waste,
       pr.price_cents_per_gram,
       sum(u.grams) * 1.10 * pr.price_cents_per_gram as cost_cents_incl_waste
from v_theoretical_raw_usage_lines u
left join lateral (
  select r.id, r.item_kind from raw_ingredients r
  where r.location_id = u.location_id and lower(btrim(r.name)) = u.ingredient_key
  limit 1
) ri on true
left join ingredient_current_price_by_name pr on pr.ingredient_key = u.ingredient_key
group by u.location_id, u.date, u.ingredient_key, ri.id, ri.item_kind, pr.price_cents_per_gram;

comment on view v_theoretical_raw_usage_daily is
  'Theoretical raw usage per location, day and ingredient. grams = recipe; '
  'grams_incl_waste = recipe + the standard 10% waste. Cost at the CURRENT price '
  '(ingredient_current_price_by_name), not the price on that day.';

-- ---------------------------------------------------------------------------
-- 5. Theoretical food cost per week (Monday start)
-- ---------------------------------------------------------------------------
create or replace view v_theoretical_food_cost_weekly as
with rev as (
  select location_id, date_trunc('week', date)::date as week_start,
         sum(net_revenue_cents) as revenue_cents,
         sum(net_revenue_cents) filter (where menu_item_id is not null) as revenue_costed_cents,
         sum(quantity) as units, sum(free_quantity) as free_units
  from pos_sales_daily group by 1, 2
), cost as (
  select location_id, date_trunc('week', date)::date as week_start,
         sum(cost_cents_incl_waste) as cost_cents_incl_waste,
         sum(grams) filter (where price_cents_per_gram is null) / nullif(sum(grams), 0) as share_grams_without_price
  from v_theoretical_raw_usage_daily group by 1, 2
)
select r.location_id, l.name as location_name, r.week_start,
       round(r.revenue_cents / 100.0, 2) as revenue_eur,
       round(r.revenue_costed_cents / 100.0, 2) as revenue_costed_eur,
       round(c.cost_cents_incl_waste / 100.0, 2) as theoretical_cost_eur_incl_waste,
       round(c.cost_cents_incl_waste / nullif(r.revenue_costed_cents, 0) * 100, 1) as theoretical_food_cost_pct,
       round(r.revenue_costed_cents::numeric / nullif(r.revenue_cents, 0) * 100, 1) as revenue_coverage_pct,
       round(c.share_grams_without_price * 100, 1) as pct_grams_without_price,
       r.units, r.free_units
from rev r
join locations l on l.id = r.location_id
left join cost c using (location_id, week_start);

comment on view v_theoretical_food_cost_weekly is
  'Theoretical food cost per location and week: recipe cost incl. 10% waste of what was '
  'sold, over net revenue excl. VAT of the items that have a recipe. Excl. VAT on both '
  'sides. Compare with actual purchasing in mima-data (gold.v_purchase_reconciliation_monthly).';

-- ---------------------------------------------------------------------------
-- 6. The test: theoretical usage against what was ordered, per week
-- ---------------------------------------------------------------------------
create or replace view v_theoretical_vs_ordered_weekly as
with ordered as (
  select o.location_id, date_trunc('week', o.order_date)::date as week_start,
         lower(btrim(ri.name)) as ingredient_key, min(ri.name) as ingredient_name,
         sum(oli.quantity * case lower(ps.size_unit)
               when 'kg'  then ps.size * 1000
               when 'l'   then ps.size * 1000
               when 'g'   then ps.size
               when 'ml'  then ps.size
               when 'pcs' then ps.size * ps.grams_per_piece
             end) as ordered_grams,
         count(*) filter (where ps.id is null
                             or (lower(ps.size_unit) = 'pcs' and ps.grams_per_piece is null)) as lines_unconverted,
         count(*) as lines
  from orders o
  join order_line_items oli on oli.order_id = o.id
  join raw_ingredients ri on ri.id = oli.raw_ingredient_id
  left join ingredient_pack_sizes ps on ps.id = oli.pack_size_id
  where o.status = 'submitted'
  group by 1, 2, 3
), theo as (
  select location_id, date_trunc('week', date)::date as week_start, ingredient_key,
         min(ingredient_name) as ingredient_name,
         sum(grams) as theoretical_grams, sum(grams_incl_waste) as theoretical_grams_incl_waste
  from v_theoretical_raw_usage_daily group by 1, 2, 3
)
select coalesce(t.location_id, o.location_id) as location_id, l.name as location_name,
       coalesce(t.week_start, o.week_start) as week_start,
       coalesce(t.ingredient_key, o.ingredient_key) as ingredient_key,
       coalesce(t.ingredient_name, o.ingredient_name) as ingredient_name,
       round(t.theoretical_grams) as theoretical_grams,
       round(t.theoretical_grams_incl_waste) as theoretical_grams_incl_waste,
       round(o.ordered_grams) as ordered_grams,
       round(o.ordered_grams / nullif(t.theoretical_grams_incl_waste, 0), 2) as ordered_vs_theoretical,
       o.lines as order_lines, o.lines_unconverted
from theo t
full join ordered o
  on o.location_id = t.location_id and o.week_start = t.week_start and o.ingredient_key = t.ingredient_key
join locations l on l.id = coalesce(t.location_id, o.location_id);

comment on view v_theoretical_vs_ordered_weekly is
  'Per location, week and raw ingredient: theoretical usage from sales against what was '
  'ordered in the app (submitted orders, by order date). ordered_vs_theoretical > 1 means '
  'more was ordered than the recipes explain. Order date is not delivery date, so read it '
  'over several weeks. lines_unconverted counts order lines whose pack has no gram weight.';

-- ---------------------------------------------------------------------------
-- 7. Access: logged-in users read; the nightly job writes on a direct
--    postgres connection. Revenue is not for the anon key.
-- ---------------------------------------------------------------------------
alter table pos_sales_daily enable row level security;
alter table pos_sales_variant_daily enable row level security;
alter table pos_variant_effects enable row level security;

drop policy if exists pos_sales_daily_select on pos_sales_daily;
create policy pos_sales_daily_select on pos_sales_daily for select to authenticated using (true);
drop policy if exists pos_sales_variant_daily_select on pos_sales_variant_daily;
create policy pos_sales_variant_daily_select on pos_sales_variant_daily for select to authenticated using (true);
drop policy if exists pos_variant_effects_select on pos_variant_effects;
create policy pos_variant_effects_select on pos_variant_effects for select to authenticated using (true);

revoke all on pos_sales_daily, pos_sales_variant_daily, pos_variant_effects from anon;
revoke all on v_prep_raw_per_gram, v_menu_item_raw_per_unit, v_bowl_base_raw_per_bowl,
              v_pos_variant_raw_per_unit, v_theoretical_raw_usage_lines,
              v_theoretical_raw_usage_daily, v_theoretical_food_cost_weekly,
              v_theoretical_vs_ordered_weekly from anon;
grant select on v_prep_raw_per_gram, v_menu_item_raw_per_unit, v_bowl_base_raw_per_bowl,
                v_pos_variant_raw_per_unit, v_theoretical_raw_usage_lines,
                v_theoretical_raw_usage_daily, v_theoretical_food_cost_weekly,
                v_theoretical_vs_ordered_weekly to authenticated;

commit;
