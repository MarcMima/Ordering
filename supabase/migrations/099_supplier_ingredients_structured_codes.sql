-- Kolommen voor gestructureerde leverancierscodes (o.a. Bidfood CSV-import en handmatige admin).
-- dispatch-order merged deze met supplier_sku; ontbraken ze in het schema, faalde import/upsert stil of inconsistent.

ALTER TABLE supplier_ingredients
  ADD COLUMN IF NOT EXISTS ean_code TEXT,
  ADD COLUMN IF NOT EXISTS supplier_article_code TEXT,
  ADD COLUMN IF NOT EXISTS supplier_article_name TEXT,
  ADD COLUMN IF NOT EXISTS order_unit TEXT,
  ADD COLUMN IF NOT EXISTS order_unit_size NUMERIC,
  ADD COLUMN IF NOT EXISTS notes TEXT;
