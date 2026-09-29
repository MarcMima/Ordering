-- 249: cleaning list gets can opener, magnetic knife holder and utensil holder as their own rows
-- (Barbara, 29-09-2026: inspectors always check the can opener; not seen as a "kitchen machine").
alter table haccp_schoonmaak
  add column if not exists blikopener boolean[] default array[null,null,null,null,null,null,null]::boolean[],
  add column if not exists messenmagneet boolean[] default array[null,null,null,null,null,null,null]::boolean[],
  add column if not exists keukengereihouder boolean[] default array[null,null,null,null,null,null,null]::boolean[];

select column_name from information_schema.columns
where table_name = 'haccp_schoonmaak' and column_name in ('blikopener', 'messenmagneet', 'keukengereihouder');
