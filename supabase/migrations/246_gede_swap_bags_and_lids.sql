-- Applied to the Ordering Supabase project on 29-09-2026 via mima-psql.
-- Barbara (29-09-2026): the GéDé order for "Paper bags small" contained EN5030 (70 g), which is the large bag.
-- The GéDé price list of 31-08-2026 (docs/gede_verpakking_verwerking_20260831.sql) has large = EN5030, small = EN5040,
-- pita lid (diameter 150) = EN5053 and bowl lid (diameter 185) = EN5054. The supplier mapping still had them swapped.
begin;
with m(name, code, art_name) as (values
  ('Paper bags large', 'EN5030', 'Papieren-draagtassen PAPIER Bruin 70 g (MIMA print)'),
  ('Paper bags small', 'EN5040', 'Papieren-draagtassen PAPIER Bruin 80 g (MIMA print)'),
  ('Lids (pita)',      'EN5053', 'Ronde deksels Pet anti-fog 150 mm (MIMA print)'),
  ('Lids (bowl)',      'EN5054', 'Ronde deksels Pet anti-fog 185 mm (MIMA print)')
)
update supplier_ingredients s
set supplier_article_code = m.code, supplier_sku = m.code, supplier_article_name = m.art_name, updated_at = now()
from m, raw_ingredients r, suppliers su
where r.id = s.raw_ingredient_id and r.name = m.name and su.id = s.supplier_id and su.name = 'GéDé';
commit;
