-- Applied to the Ordering Supabase project on 29-09-2026 via mima-psql.
-- HACCP feedback from Hadi/Barbara/Denys (29-09-2026):
-- "Hot line mujadara" is spelled "Mujdara"; Pijp (store 2) and Zuidas (store 3) only have 2 fryers.
begin;
update haccp_store_equipment set label='Hot line Mujdara' where label='Hot line mujadara';
delete from haccp_store_equipment where store_id in (2,3) and label='Fryer 3 (right)';
update haccp_store_equipment set label='Fryer 2 (right)' where store_id in (2,3) and label='Fryer 2 (middle)';
commit;
