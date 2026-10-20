-- ============================================================================
-- Migration 261: ingredients and prep items for recipe book v1.1 (prepared, not live)
--
-- Marc, 20-10-2026: "zet nog maar alleen klaar, dan introduceren we het bij het
-- vernieuwde receptenboek". Everything below is created with
-- stocktake_visible = false, so nothing appears on the stock count or in the
-- order suggestions until someone switches it on.
--
-- 1. New raw ingredients + supplier links + prices (webshop prices, excl. VAT assumed):
--    - Green rawit (bird's eye chili): Van Gelder 118385, box 2 kg, EUR 29,95
--    - Dates pitted: Van Gelder 100935, crate 5 kg, EUR 24,50
--    - Dijon mustard: Bidfood 156611 (Marne), jar 1 kg, EUR 5,41 (tray 6: EUR 32,47)
--    - Honey, Kofte: no supplier article yet (to be linked)
-- 2. Srug: 50 rawit per batch (Marc). Weight per pepper assumed 2,5 g -> 125 g (assumption, confirm).
-- 3. Prep items (hidden): Lemon herb tahini, Date vinaigrette, Toum, quantities as in
--    recipe book v1.1. White balsamic replaced by the white vinegar we already stock.
--    g -> ml where the app ingredient is in ml: olive oil / sunflower oil 0,92 g/ml,
--    lemon juice and vinegar 1,0 g/ml. Egg white 30 g = 1 egg.
-- ============================================================================
begin;

do $$
declare
  vg record; bf record; rid uuid;
begin
  perform fn_ensure_raw_ingredient('Green rawit', 'g', 'food');
  perform fn_ensure_raw_ingredient('Dates pitted', 'g', 'food');
  perform fn_ensure_raw_ingredient('Dijon mustard', 'g', 'food');
  perform fn_ensure_raw_ingredient('Honey', 'g', 'food');
  perform fn_ensure_raw_ingredient('Kofte', 'g', 'food');

  -- supplier links + prices per location (suppliers are per location)
  for vg in
    select s.id sid, l.id lid from suppliers s join locations l on l.id = s.location_id where s.name = 'Van Gelder'
  loop
    -- rawit
    select id into rid from raw_ingredients where location_id = vg.lid and name = 'Green rawit';
    if not exists (select 1 from supplier_ingredients where raw_ingredient_id = rid and supplier_id = vg.sid) then
      insert into supplier_ingredients(supplier_id, raw_ingredient_id, supplier_sku, is_preferred, ean_code, supplier_article_code, supplier_article_name, order_unit, order_unit_size, notes)
      values (vg.sid, rid, '8713507179392', true, '8713507179392', '118385', 'Rawit groen doos 2kg stuk', 'ST', 2, 'Added 20-10-2026 for srug (recipe book v1.1); hidden until launch');
      insert into ingredient_prices(raw_ingredient_id, supplier_id, pack_size_grams, pack_size_label, price_cents, price_includes_vat, effective_date, source, notes)
      values (rid, vg.sid, 2000, 'Doos 2 kg', 2995, false, '2026-10-20', 'Van Gelder webshop 20-10-2026, art 118385', 'Excl. VAT assumed (B2B webshop)');
    end if;
    -- dates
    select id into rid from raw_ingredients where location_id = vg.lid and name = 'Dates pitted';
    if not exists (select 1 from supplier_ingredients where raw_ingredient_id = rid and supplier_id = vg.sid) then
      insert into supplier_ingredients(supplier_id, raw_ingredient_id, supplier_sku, is_preferred, ean_code, supplier_article_code, supplier_article_name, order_unit, order_unit_size, notes)
      values (vg.sid, rid, '8713507188219', true, '8713507188219', '100935', 'Dadels zonder pit kist 5 kilogram', 'KST5KG', 5, 'Added 20-10-2026 for date vinaigrette (recipe book v1.1); hidden until launch');
      insert into ingredient_prices(raw_ingredient_id, supplier_id, pack_size_grams, pack_size_label, price_cents, price_includes_vat, effective_date, source, notes)
      values (rid, vg.sid, 5000, 'Kist 5 kg', 2450, false, '2026-10-20', 'Van Gelder webshop 20-10-2026, art 100935', 'Excl. VAT assumed (B2B webshop)');
    end if;
  end loop;

  for bf in
    select s.id sid, l.id lid from suppliers s join locations l on l.id = s.location_id where s.name = 'Bidfood'
  loop
    select id into rid from raw_ingredients where location_id = bf.lid and name = 'Dijon mustard';
    if not exists (select 1 from supplier_ingredients where raw_ingredient_id = rid and supplier_id = bf.sid) then
      insert into supplier_ingredients(supplier_id, raw_ingredient_id, supplier_sku, is_preferred, supplier_article_code, supplier_article_name, order_unit, notes)
      values (bf.sid, rid, '156611', true, '156611', 'Dijon mosterd, pot 1 kg (Marne)', 'POT', 'Added 20-10-2026 for date vinaigrette (recipe book v1.1); tray of 6 also available (EUR 32,47); hidden until launch');
      insert into ingredient_prices(raw_ingredient_id, supplier_id, pack_size_grams, pack_size_label, price_cents, price_includes_vat, effective_date, source, notes)
      values (rid, bf.sid, 1000, 'Pot 1 kg', 541, false, '2026-10-20', 'Bidfood webshop 20-10-2026, art 156611', 'Excl. VAT assumed (B2B webshop)');
    end if;
  end loop;

  -- prep items (hidden from stock count)
  insert into prep_items(name, unit, content_amount, content_unit, recipe_output_amount, recipe_output_unit, ingredient_qty_is_per_recipe_batch, stocktake_visible, yield_source, yield_note, lead_days)
  select v.name, 'Batch', v.amt, v.u, v.amt, v.u, true, false, 'assumed', 'Yield from recipe book v1.1 (20-10-2026), not measured', 0
  from (values ('Lemon herb tahini', 1500::numeric, 'ml'), ('Date vinaigrette', 1400::numeric, 'ml'), ('Toum', 600::numeric, 'g')) v(name, amt, u)
  where not exists (select 1 from prep_items p where lower(p.name) = lower(v.name));
end $$;

-- Lemon herb tahini (recipe book v1.1 p. 23)
select fn_set_recipe_line('Lemon herb tahini', 'Tahini', 540, false);
select fn_set_recipe_line('Lemon herb tahini', 'Lemon juice', 360, false);
select fn_set_recipe_line('Lemon herb tahini', 'Olive oil', 196, false);       -- 180 g
select fn_set_recipe_line('Lemon herb tahini', 'Vinegar', 45, false);
select fn_set_recipe_line('Lemon herb tahini', 'Honey', 45, false);
select fn_set_recipe_line('Lemon herb tahini', 'Coriander (fresh)', 30, false);
select fn_set_recipe_line('Lemon herb tahini', 'Parsley', 30, false);
select fn_set_recipe_line('Lemon herb tahini', 'Mint', 15, false);
select fn_set_recipe_line('Lemon herb tahini', 'Salt', 15, false);
select fn_set_recipe_line('Lemon herb tahini', 'Water', 270, false);

-- Date vinaigrette (p. 24)
select fn_set_recipe_line('Date vinaigrette', 'Olive oil', 435, false);        -- 400 g
select fn_set_recipe_line('Date vinaigrette', 'Vinegar', 300, false);
select fn_set_recipe_line('Date vinaigrette', 'Water', 300, false);
select fn_set_recipe_line('Date vinaigrette', 'Dates pitted', 260, false);
select fn_set_recipe_line('Date vinaigrette', 'Dijon mustard', 160, false);
select fn_set_recipe_line('Date vinaigrette', 'Salt', 15, false);

-- Toum (p. 25)
select fn_set_recipe_line('Toum', 'Garlic peeled', 100, false);
select fn_set_recipe_line('Toum', 'Sunflower oil', 435, false);                -- 400 g
select fn_set_recipe_line('Toum', 'Eggs', 1, false);                           -- 30 g egg white
select fn_set_recipe_line('Toum', 'Lemon juice', 40, false);
select fn_set_recipe_line('Toum', 'Water', 20, false);
select fn_set_recipe_line('Toum', 'Salt', 10, false);

-- Srug: 50 green rawit per batch (assumed 2,5 g each)
select fn_set_recipe_line('Srug', 'Green rawit', 125, false);

commit;
