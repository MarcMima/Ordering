-- Kostprijs fase 2 — verwerking reviewbesluiten Marc, 31-08-2026
-- Uitvoeren in Supabase SQL editor van "MarcMima's Project" (app-database).
-- Alles in één transactie: bij een fout wordt niets gewijzigd.

begin;

-- A. Elf inkoopprijzen (ex BTW), gekoppeld per ingrediëntnaam over alle locaties.
insert into ingredient_prices (raw_ingredient_id, supplier_id, pack_size_grams, pack_size_label, price_cents, price_includes_vat, effective_date, source, notes)
select ri.id, s.id, v.grams, v.label, v.cents, false, current_date, v.src, v.notes
from (values
  ('Marinated chicken','Bidfood',10000,'Doos 10 kg',5970,'Bidfood assortiment 30-08-2026, art 172799','Gemarineerde kipdijstukken Mr.John'),
  ('Shifka peppers','Bidfood',560,'Blik 560 g',211,'Bidfood assortiment 30-08-2026, art 169979','Med Cuisine'),
  ('Middle Eastern pickles','Bidfood',3000,'Blik 3 kg',724,'Bidfood assortiment 30-08-2026, art 170025','Augurken in pekel Med Cuisine'),
  ('Kalamata olives','Bidfood',2700,'Pot 5,2 kg, uitlekgewicht 2,7 kg',3052,'Bidfood assortiment 30-08-2026, art 056453','Prijs per uitlekgewicht; recepten rekenen met uitgelekte olijven (Marc 31-08-2026)'),
  ('Feta cheese','Bidfood',1600,'Folie 1,6 kg',2284,'Bidfood assortiment 30-08-2026, art 136912','Griekse feta 45+ PDO Taverna'),
  ('Whole wheat pita bread 15 cm','Bidfood',5500,'Doos 50 st a 110 g',3224,'Bidfood assortiment 30-08-2026, art 173445','EUR 0,64 per stuk'),
  ('Rice pandan','Bidfood',4500,'Zak 4,5 kg',845,'Bidfood assortiment 30-08-2026, art 089581','Vervangt Excel-prijs 10,44'),
  ('Lemon juice','Bidfood',6000,'Doos 6x1 L',1537,'Bidfood assortiment 30-08-2026, art 098177','Arco citroensap, vervangt Polenghi'),
  ('Garlic peeled','Van Gelder',1000,'Zak 1 kg',625,'251126_Menu.xlsx, bevestigd Marc 31-08-2026','Knoflook gepeld-schoon'),
  ('Carrot julienne','Van Gelder',1000,'Zak 1 kg',395,'Opgave Marc 31-08-2026','Winterpeen julienne 1mm, EAN 8713507257069'),
  ('Frozen flatbreads','Java Bakery',350,'Pakje 5 st, 350 g',65,'251126_Menu.xlsx, bevestigd Marc 31-08-2026','Merk Al Hassnah, EUR 0,13 per stuk')
) as v(naam, lev, grams, label, cents, src, notes)
join raw_ingredients ri on ri.name = v.naam
join suppliers s on s.name = v.lev and s.location_id = ri.location_id;

-- B1. Vier dranken als menu-items (prijs = instore, incl. BTW).
insert into menu_items (name, category, price_cents, active, description) values
  ('Charlies','drink',350,true,'Toegevoegd 31-08-2026 vanuit kostprijsmodel'),
  ('Coca-Cola','drink',295,true,'Toegevoegd 31-08-2026 vanuit kostprijsmodel'),
  ('Lemonade','drink',350,true,'Toegevoegd 31-08-2026 vanuit kostprijsmodel'),
  ('Marie Stella Maris','drink',295,true,'Toegevoegd 31-08-2026 vanuit kostprijsmodel');

-- B2. Kanaalprijzen (incl. BTW): bezorgprijs op Uber Eats én Thuisbezorgd; Butlaroo online = instore.
insert into menu_item_channel_prices (menu_item_id, channel, price_cents, price_includes_vat)
select m.id, v.channel, v.cents, true
from (values
  ('Charlies','instore',350),('Charlies','uber_eats',450),('Charlies','thuisbezorgd',450),
  ('Coca-Cola','instore',295),('Coca-Cola','uber_eats',295),('Coca-Cola','thuisbezorgd',295),
  ('Lemonade','instore',350),('Lemonade','uber_eats',450),('Lemonade','thuisbezorgd',450),
  ('Marie Stella Maris','instore',295),('Marie Stella Maris','uber_eats',295),('Marie Stella Maris','thuisbezorgd',295)
) as v(naam, channel, cents)
join menu_items m on m.name = v.naam and m.category = 'drink';

-- D. Reviewregels afhandelen (verpakking blijft bewust open tot de GeDe-prijslijst er is).
update kostprijs_import_review
set resolved = true, opmerking = coalesce(opmerking,'') || ' || 31-08-2026: vervallen per besluit Marc'
where not resolved and excel_name in (
  'Belvoir mint lime','Heineken twist-off','AH Reep puur','Beets',
  'Bladpeterselie gesneden 3mm zak 500gr stuk','Carrots','Wortelen','Chocolate chip',
  'Pomegranate molassis','Sesamzaad','Spring onion',
  'Heineken twist-off (verkoop, BTW 21%)','Mezze Marinated beets','Mezze Moroccan carrots',
  'Mezze Mediterranean salad (= Israeli salad)');

update kostprijs_import_review
set resolved = true, opmerking = coalesce(opmerking,'') || ' || 31-08-2026: geparkeerd, ingredient bestaat nog niet in de app en geen recept verwijst ernaar'
where not resolved and excel_name in ('Baharat','Dadels zonder pit','Mint (dried)','Onion powder','Paprika (smoked)','Paprika (sweet)');

update kostprijs_import_review
set resolved = true, opmerking = coalesce(opmerking,'') || ' || 31-08-2026: verwerkt, prijs of verkoopprijs ingevoerd'
where not resolved and categorie <> 'verpakking';

commit;

-- Controle na afloop (verwacht: 1e query rijen > 0, alleen verpakking nog open in 2e):
select count(*) as nieuwe_prijzen from ingredient_prices where effective_date = current_date;
select categorie, count(*) from kostprijs_import_review where not resolved group by categorie;
