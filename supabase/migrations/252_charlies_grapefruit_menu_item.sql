-- ============================================================================
-- Migration 252: Charlie's Grapefruit as its own menu item
--
-- Mima sells two Charlie's: Orange & Mandarin and Grapefruit (Marc,
-- 14-10-2026). The app only had "Charlies" (Orange Mandarin), so Grapefruit
-- sales had no cost or nutrition. Same prices as Charlies (EUR 3,50 instore,
-- EUR 4,50 Uber Eats / Thuisbezorgd); component = the canonical raw
-- ingredient Charlie's Grapefruit, 330 ml.
-- gold.dim_product_map (mima-data) maps "Charlie's Grapefruit" to this item.
-- ============================================================================
begin;

insert into menu_items (name, category, price_cents, active, description)
select 'Charlie''s Grapefruit', 'drink', 350, true, 'Added 14-10-2026 (second Charlie''s flavour)'
where not exists (select 1 from menu_items where name = 'Charlie''s Grapefruit');

insert into menu_item_channel_prices (menu_item_id, channel, price_cents, price_includes_vat)
select mi.id, c.channel, c.price_cents, true
from menu_items mi
cross join (values ('instore', 350), ('uber_eats', 450), ('thuisbezorgd', 450)) c(channel, price_cents)
where mi.name = 'Charlie''s Grapefruit'
  and not exists (select 1 from menu_item_channel_prices x where x.menu_item_id = mi.id and x.channel = c.channel);

insert into menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, display_order)
select mi.id, ri.id, 330, 0
from menu_items mi
join raw_ingredients ri on ri.name = 'Charlie''s Grapefruit'
join locations l on l.id = ri.location_id and l.is_canonical
where mi.name = 'Charlie''s Grapefruit'
  and not exists (select 1 from menu_item_components x where x.menu_item_id = mi.id);

commit;
