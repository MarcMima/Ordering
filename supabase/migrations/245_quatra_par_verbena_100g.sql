-- Applied to the Ordering Supabase project on 29-09-2026 via mima-psql.
-- Quatra frying oil: reorder 10 boxes when fewer than 3 boxes are left (Marc, 29-09-2026).
-- Verbena tea is bought and counted per 100 g pack.
begin;
update raw_ingredients set stock_par_min_packs=3, stock_par_order_packs=10 where name='Quatra oil';
update raw_ingredients set stocktake_content_amount=100, stocktake_content_unit='g' where name='Verbena tea';
update ingredient_pack_sizes p set size=100, size_unit='g', display_unit_label='pack (100 g)'
  from raw_ingredients r where r.id=p.raw_ingredient_id and r.name='Verbena tea';
commit;
