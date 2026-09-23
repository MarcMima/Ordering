-- GeDe-verpakkingsprijzen — verwerking mapping-besluiten Marc, 31-08-2026
-- Prijzen = prijsafspraak ex BTW van "Prijslijst Mima 2026" (GeDe);
-- 2% handelskorting en 1% factuurkorting bewust niet verrekend.
-- Eén transactie: bij een fout wordt niets gewijzigd.

begin;

-- 0. Leverancier GeDe bestond nog niet in de app — per locatie aanmaken.
insert into suppliers (location_id, name)
select l.id, 'GeDe' from locations l
where not exists (select 1 from suppliers s where s.name = 'GeDe' and s.location_id = l.id);

-- 1. Zeventien verpakkingsprijzen (pack_size_grams = aantal stuks, conform bestaande conventie).
insert into ingredient_prices (raw_ingredient_id, supplier_id, pack_size_grams, pack_size_label, price_cents, price_includes_vat, effective_date, source, notes)
select ri.id, s.id, v.stuks, v.label, v.cents, false, current_date, 'GeDe prijslijst 2026, art ' || v.art, v.notes
from (values
  ('Falafel container','09348',1000,'1000 stuks, 500cc kraft bowl',8320,'500cc saladbowl diameter 150, voor falafel mezze (Marc 31-08-2026)'),
  ('Pita container','09349',1000,'1000 stuks, 1000cc kraft bowl',9500,'1000cc saladbowl diameter 150, voor pita takeaway; oude prijs 12500'),
  ('Bowl container','10015',1000,'1000 stuks, 1100cc kraft bowl',6142,'1100cc diameter 185, voor de bowls; vervangt de 1300cc (13750)'),
  ('Lids (pita)','EN5053',1000,'1000 stuks, PET deksel diameter 150',7460,'past op 500cc en 1000cc bowls, bedrukt Mima'),
  ('Lids (bowl)','EN5054',1000,'1000 stuks, PET deksel diameter 185',10380,'past op de 1100cc bowl, bedrukt Mima'),
  ('Mezze container','00742',1000,'1000 stuks, 350cc PP bak',5612,null),
  ('Mezze lids','01238',500,'500 stuks, PP deksel 115mm',1496,'oude prijs 1300 was ook per 500 (Marc 31-08-2026)'),
  ('Flatbreadchips bags with window','08576',1000,'1000 stuks',16201,'kraft zak met venster en tin tie'),
  ('Paper bags large','EN5030',1000,'1000 stuks, 320x295',13620,'opdruk MIMA'),
  ('Paper bags small','EN5040',1000,'1000 stuks, 270x295',11120,'opdruk MIMA'),
  ('Plastic bottle (rose lemonade)','04434',1000,'1000 stuks, rPET 500ml met dop',26500,'500ml vervangt de 330ml (Marc 31-08-2026)'),
  ('Sauce lid','1137F',1000,'1000 stuks, sauscup deksel',1102,null),
  ('Soup container','09365',500,'500 stuks, 450ml soup-to-go',3520,'vervangt 4400 per 500'),
  ('Soup lids','09366',500,'500 stuks, soup-to-go deksel',3485,'vervangt 4950 per 500'),
  ('Coffee lids','09401',1000,'1000 stuks, zwart PS 10-16oz',4142,null),
  ('Catering container','07542',200,'200 stuks, lunchbox 2000cc',3500,null),
  ('Pita pouches','EN5051',1000,'1000 stuks, hamburgerzakjes',2190,'opdruk MIMA')
) as v(naam, art, stuks, label, cents, notes)
join raw_ingredients ri on ri.name = v.naam
join suppliers s on s.name = 'GeDe' and s.location_id = ri.location_id;

-- 2. De tien verpakkings-reviewregels afronden.
update kostprijs_import_review
set resolved = true, opmerking = coalesce(opmerking,'') || ' || 31-08-2026: verwerkt via GeDe prijslijst 2026'
where not resolved and categorie = 'verpakking';

commit;

-- Controle: verwacht ± 51 GeDe-prijsregels (17 artikelen x locaties) en 0 open reviewregels.
select (select count(*) from ingredient_prices ip join suppliers s on s.id = ip.supplier_id where s.name = 'GeDe') as gede_prijzen,
       (select count(*) from kostprijs_import_review where not resolved) as open_review;
