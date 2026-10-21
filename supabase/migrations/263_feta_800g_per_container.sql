-- ============================================================================
-- Migration 263: Feta prep, 800 g feta per GN 1/6 container (was 900 g)
-- Marc, 21-10-2026: the Bidfood pack is now 1600 g and makes about 2 containers.
-- content_amount (750 g, used by the stock count) deliberately left unchanged.
-- ============================================================================
begin;
select fn_set_recipe_line('Feta', 'Feta cheese', 800, false);
update prep_items set yield_note = 'Marc 21-10-2026: one Bidfood pack of 1600 g makes about 2 GN 1/6 containers, so 800 g feta per container (was 900 g).', updated_at = now() where name = 'Feta';
commit;
