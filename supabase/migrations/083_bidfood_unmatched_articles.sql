-- 077: Bidfood unmatched articles tabel
-- Voor artikelen in de Bidfood CSV die niet automatisch gematcht zijn
-- aan een raw_ingredient. Handmatig koppelen via Admin.
-- Run na 076.

CREATE TABLE IF NOT EXISTS bidfood_unmatched_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artnum TEXT NOT NULL UNIQUE,       -- 6-cijferig artikelnummer
  sku_id TEXT,                       -- artnum + uom, bijv. "013147BB"
  description TEXT NOT NULL,
  brand TEXT,
  ean_ve TEXT,                       -- GTIN-14 verpakkingseenheid
  net_price_cents INTEGER,
  order_status INTEGER,              -- 0=beschikbaar, 2=uit assortiment
  raw_ingredient_id UUID REFERENCES raw_ingredients(id) ON DELETE SET NULL,
  matched_manually BOOLEAN DEFAULT false,
  last_seen DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bidfood_unmatched_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bidfood_unmatched_all" ON bidfood_unmatched_articles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE bidfood_unmatched_articles IS
  'Bidfood artikelen die niet automatisch gematcht zijn aan een raw_ingredient.
   Vul raw_ingredient_id handmatig in via Admin, dan pikt de volgende import het op.';
