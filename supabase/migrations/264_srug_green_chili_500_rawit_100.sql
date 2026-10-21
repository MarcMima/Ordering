-- ============================================================================
-- Migration 264: Srug, 500 g green chili + 100 g green rawit per batch
-- Marc, 21-10-2026 (was 600 g green chili + 125 g rawit, the rawit weight was an assumption).
-- Matches recipe book v1.2 p. 18.
-- ============================================================================
begin;
select fn_set_recipe_line('Srug', 'Green chili', 500, false);
select fn_set_recipe_line('Srug', 'Green rawit', 100, false);
commit;
