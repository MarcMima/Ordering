-- ============================================================================
-- Migration 262: rename prep item "Lemon herb tahini" to "Herb tahini dressing"
-- Name chosen by Marc, 20-10-2026 (recipe book v1.1 p. 23). Item stays hidden.
-- ============================================================================
begin;
update prep_items set name = 'Herb tahini dressing', updated_at = now() where name = 'Lemon herb tahini';
commit;
