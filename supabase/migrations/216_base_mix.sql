-- ============================================================================
-- Migratie 216 — base_mix: werkelijke bowl-base mix uit het warehouse
-- Tweelingbroer van channel_mix (migratie 206). Het warehouse schrijft hierin
-- via push_base_mix.py (repo MarcMima/mima-data); de app leest alleen.
--
-- Genummerd 216 en niet 214: 214_integration_tokens.sql en
-- 215_ingredient_price_stats.sql bestaan al, staan gecommit en zijn ook al
-- toegepast in productie -- alleen geregistreerd onder een tijdstempelversie
-- (20260901115255 resp. 20260901130630) in plaats van onder 214/215. Twee
-- bestanden met hetzelfde nummer laten `supabase db push` struikelen, dus
-- pakt deze migratie het eerstvolgende vrije nummer.
--
-- base_combination is de SLEUTEL UIT bowl_base_options, niet een eigen tekst
-- ---------------------------------------------------------------------------
-- bowl_base_options modelleert de combinaties al, inclusief grammen, en dekt
-- precies de tien combinaties die in de kassa voorkomen:
--
--   hummus 150   lettuce 70   mudardara 240   turmeric_rice 240
--   hummus_lettuce 140        hummus_mudardara 220
--   mudardara_lettuce 160     hummus_turmeric_rice 220
--   mudardara_turmeric_rice 240   lettuce_turmeric_rice 160
--
-- Die grammen bevestigen ook dat twee bases NIET elk een halve portie zijn:
-- hummus gaat van 150 naar 100 en lettuce van 70 naar 40, terwijl mudardara en
-- turmeric rice wel halveren (240 -> 120). Precies zoals opgegeven.
--
-- Daarom staat in base_combination de slug ('hummus_mudardara') en niet een
-- eigen samengestelde tekst ('Hummus + Mudardara'): dat is de enige waarde die
-- letterlijk op bowl_base_options matcht, hij is al genormaliseerd, en hij lost
-- meteen op dat de kassa "Romaine Lettuce" zegt waar de app "Lettuce" zegt. De
-- leesbare naam staat in bowl_base_options.display_name en hoeft hier niet nog
-- eens.
--
-- Dat maakt een echte foreign key mogelijk (name is uniek): een combinatie die
-- niet bestaat kan er niet meer in, in plaats van alleen luid in de log.
-- ============================================================================
begin;

create table if not exists base_mix (
  id                uuid primary key default gen_random_uuid(),
  location_id       uuid not null references locations(id) on delete cascade,
  base_combination  text not null references bowl_base_options(name),
  bowls             integer,
  share_pct         numeric not null,
  choices_per_bowl  numeric,
  period_start      date not null default current_date,
  period_end        date,
  updated_at        timestamptz not null default now()
);

comment on table base_mix is
  'Werkelijke bowl-base mix per locatie, nachtelijk gevuld vanuit het mima-data-warehouse '
  '(push_base_mix.py). De app leest alleen. Sleutel is de COMBINATIE en niet de losse base: '
  '58% van de bowls kiest er twee en die zijn niet elk een halve portie '
  '(hummus 150 -> 100 g, lettuce 70 -> 40 g; mudardara en turmeric rice halveren wel). '
  'share_pct is het aandeel in de BOWLS op die locatie, niet in de basekeuzes.';

comment on column base_mix.base_combination is
  'bowl_base_options.name, bijvoorbeeld ''hummus_mudardara''. De kassa levert display-namen '
  '("Romaine Lettuce"); push_base_mix.py vertaalt die naar deze slug via display_name.';

comment on column base_mix.choices_per_bowl is
  'Gemiddeld aantal bases per bowl op die locatie (ca. 1,56). Per locatie gelijk op elke rij; '
  'staat er als controlegetal, zodat scheefgroei opvalt zonder opnieuw te aggregeren.';

create unique index if not exists base_mix_loc_combo_period_uniq
  on base_mix (location_id, base_combination, period_start);
create index if not exists base_mix_location_idx on base_mix (location_id);

alter table base_mix enable row level security;

-- Lezen voor ingelogde gebruikers; schrijven gebeurt door de nachtelijke job
-- op een directe postgres-verbinding, die RLS niet passeert.
-- (channel_mix heeft historisch een ALL-policy; hier bewust alleen select.)
drop policy if exists base_mix_select on base_mix;
create policy base_mix_select on base_mix for select to authenticated using (true);

commit;
