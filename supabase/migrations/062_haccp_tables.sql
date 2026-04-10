-- HACCP registratie – 6 tabellen (handmatig ook als 20240411_create_haccp.sql te draaien)

-- ─── 1. Temperaturen ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS haccp_temperaturen (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        INTEGER NOT NULL,
  week_number     INTEGER NOT NULL,
  year            INTEGER NOT NULL,

  koelcel_1       NUMERIC[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::NUMERIC[],
  koelcel_2       NUMERIC[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::NUMERIC[],
  vriezer_1       NUMERIC[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::NUMERIC[],
  vriezer_2       NUMERIC[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::NUMERIC[],
  vriezer_ijs     NUMERIC[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::NUMERIC[],
  koelwerkbank_1  NUMERIC[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::NUMERIC[],
  koelwerkbank_2  NUMERIC[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::NUMERIC[],
  koelwerkbank_3  NUMERIC[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::NUMERIC[],
  saladiere_1     NUMERIC[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::NUMERIC[],
  saladiere_2     NUMERIC[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::NUMERIC[],

  vaatwasser_wastemperatuur   NUMERIC,
  vaatwasser_naspoeltemp      NUMERIC,

  opmerkingen     TEXT,
  paraaf          TEXT,

  tht_fifo_ok     BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  afgedekt_ok     BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  schoonmaak_ok   BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (store_id, week_number, year)
);

-- ─── 2. Ingangscontrole ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS haccp_ingangscontrole (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        INTEGER NOT NULL,
  week_number     INTEGER NOT NULL,
  year            INTEGER NOT NULL,
  datum           DATE NOT NULL,
  leverancier     TEXT NOT NULL,
  product         TEXT NOT NULL,
  soort           TEXT NOT NULL CHECK (soort IN ('V','C','D')),
  temperatuur     NUMERIC,
  verpakking_ok   BOOLEAN,
  tht_ok          BOOLEAN,
  correct         BOOLEAN,
  opmerkingen     TEXT,
  paraaf          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. Bereiden & serveren ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS haccp_bereiden (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        INTEGER NOT NULL,
  week_number     INTEGER NOT NULL,
  year            INTEGER NOT NULL,

  terugkoelen_nvt         BOOLEAN DEFAULT FALSE,
  terugkoelen_datum       DATE,
  terugkoelen_product     TEXT,
  terugkoelen_temp_begin  NUMERIC,
  terugkoelen_temp_2uur   NUMERIC,
  terugkoelen_temp_5uur   NUMERIC,
  terugkoelen_maatregel   TEXT,
  terugkoelen_paraaf      TEXT,

  kerntemp_gegaard_nvt    BOOLEAN DEFAULT FALSE,
  kerntemp_gegaard        JSONB DEFAULT '[]',

  kerntemp_warmhoud_nvt   BOOLEAN DEFAULT FALSE,
  kerntemp_warmhoud       JSONB DEFAULT '[]',

  serveertemp_nvt         BOOLEAN DEFAULT FALSE,
  serveertemp_warm        NUMERIC,
  serveertemp_koud        NUMERIC,
  serveertemp_paraaf      TEXT,

  frituur_nvt             BOOLEAN DEFAULT FALSE,
  frituur_metingen        JSONB DEFAULT '[]',

  regenereer_nvt          BOOLEAN DEFAULT FALSE,
  regenereer_metingen     JSONB DEFAULT '[]',

  buffet_warm_nvt         BOOLEAN DEFAULT FALSE,
  buffet_warm             JSONB DEFAULT '[]',

  buffet_koud_nvt         BOOLEAN DEFAULT FALSE,
  buffet_koud             JSONB DEFAULT '[]',

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (store_id, week_number, year)
);

-- ─── 4. Schoonmaak ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS haccp_schoonmaak (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        INTEGER NOT NULL,
  week_number     INTEGER NOT NULL,
  year            INTEGER NOT NULL,

  vriezers            BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  verdampers          BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  magazijnstellingen  BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  schappen            BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  koelingen           BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  frituren            BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  afzuiging           BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  wanden              BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  bain_marie          BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  saladiere           BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  grill               BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  werkbanken          BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  vloer               BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  vaatwasser          BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  afvalbakken         BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  schoonmaakmateriaal BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  handcontactpunten   BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  handenwas           BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  spoelbakken         BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  magnetron           BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  snijgereedschap     BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  snijplanken         BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  keukenmachines      BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],
  kleine_materialen   BOOLEAN[] DEFAULT ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL]::BOOLEAN[],

  uitgevoerd_door     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (store_id, week_number, year)
);

-- ─── 5. Thermometers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS haccp_thermometers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        INTEGER NOT NULL,
  datum           DATE NOT NULL,
  temp_kokend     NUMERIC NOT NULL,
  temp_smeltend   NUMERIC NOT NULL,
  afwijking       NUMERIC,
  maatregel       TEXT,
  paraaf          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 6. Leveranciers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS haccp_leveranciers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              INTEGER NOT NULL,
  naam                  TEXT NOT NULL,
  adres                 TEXT,
  telefoon              TEXT,
  fax                   TEXT,
  email                 TEXT,
  website               TEXT,
  kwaliteitssysteem     BOOLEAN,
  kwaliteitssysteem_naam TEXT,
  gecertificeerd        BOOLEAN,
  eg_nummer             TEXT,
  voldoet_wetgeving     BOOLEAN,
  specifieke_afspraken  TEXT,
  contactpersoon        TEXT,
  contact_telefoon      TEXT,
  contact_email         TEXT,
  datum_ondertekend     DATE,
  handtekening_url      TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haccp_temp_week        ON haccp_temperaturen    (store_id, year, week_number);
CREATE INDEX IF NOT EXISTS idx_haccp_ingang_week      ON haccp_ingangscontrole (store_id, year, week_number);
CREATE INDEX IF NOT EXISTS idx_haccp_bereiden_week    ON haccp_bereiden        (store_id, year, week_number);
CREATE INDEX IF NOT EXISTS idx_haccp_schoonmaak_week  ON haccp_schoonmaak      (store_id, year, week_number);
CREATE INDEX IF NOT EXISTS idx_haccp_therm_datum      ON haccp_thermometers    (store_id, datum);
CREATE INDEX IF NOT EXISTS idx_haccp_lever_store      ON haccp_leveranciers    (store_id);

-- RLS
ALTER TABLE haccp_temperaturen ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_ingangscontrole ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_bereiden ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_schoonmaak ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_thermometers ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_leveranciers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "haccp_temperaturen_all" ON haccp_temperaturen;
CREATE POLICY "haccp_temperaturen_all" ON haccp_temperaturen FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "haccp_ingangscontrole_all" ON haccp_ingangscontrole;
CREATE POLICY "haccp_ingangscontrole_all" ON haccp_ingangscontrole FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "haccp_bereiden_all" ON haccp_bereiden;
CREATE POLICY "haccp_bereiden_all" ON haccp_bereiden FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "haccp_schoonmaak_all" ON haccp_schoonmaak;
CREATE POLICY "haccp_schoonmaak_all" ON haccp_schoonmaak FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "haccp_thermometers_all" ON haccp_thermometers;
CREATE POLICY "haccp_thermometers_all" ON haccp_thermometers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "haccp_leveranciers_all" ON haccp_leveranciers;
CREATE POLICY "haccp_leveranciers_all" ON haccp_leveranciers FOR ALL TO authenticated USING (true) WITH CHECK (true);
