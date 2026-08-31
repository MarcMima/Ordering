-- 206: Werkelijke verkoopmix per locatie (channel_mix) + gewogen "blended" food cost
--
-- Waarom: 202 zette kanaalinstellingen en verkoopprijzen per kanaal neer, met de aantekening
-- "blend per kanaal later o.b.v. verkoopdata". Dit is die blend.
--
-- channel_mix wordt NIET door deze app gevuld: het mima-data-warehouse (MarcMima/mima-data)
-- schrijft hier nachtelijk de werkelijke verkoopmix per locatie in weg. Deze app leest alleen.
-- Daarom is dit schema (migratie) en geen config-seed: er wordt bewust geen data geseed.
--
-- Additief. Geen bestaande view of functie wordt gewijzigd; de bestaande per-kanaal-weergave
-- (menu_item_channel_prices + channel_settings) blijft ongemoeid.

-- ---------------------------------------------------------------------------
-- 1. channel_mix — verkoopmix per locatie per kanaal, per periode
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS channel_mix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL REFERENCES channel_settings(channel),
  share_pct NUMERIC NOT NULL CHECK (share_pct >= 0 AND share_pct <= 100),
  period_start DATE NOT NULL,
  period_end DATE,                             -- NULL = loopt door (huidige periode)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end IS NULL OR period_end >= period_start)
);

COMMENT ON TABLE channel_mix IS
  'Werkelijke verkoopmix per locatie per kanaal (aandeel van de omzet, %). Nachtelijk gevuld vanuit het mima-data-warehouse; deze app leest alleen. Voedt computed_menu_item_blended_food_cost.';
COMMENT ON COLUMN channel_mix.share_pct IS
  'Aandeel van dit kanaal in de omzet van deze locatie in deze periode, 0-100. Per (locatie, periode) tellen de kanalen normaal op tot 100; de blend normaliseert zelf, dus een som != 100 geeft geen foute uitkomst.';
COMMENT ON COLUMN channel_mix.period_end IS
  'NULL = huidige, doorlopende periode. De blended views gebruiken de periode die vandaag omvat.';

-- één rij per locatie/kanaal/periodestart: de nachtelijke job kan hierop upserten
CREATE UNIQUE INDEX IF NOT EXISTS channel_mix_unique_period
  ON channel_mix (location_id, channel, period_start);

CREATE INDEX IF NOT EXISTS channel_mix_location_period_idx
  ON channel_mix (location_id, period_start DESC);

ALTER TABLE channel_mix ENABLE ROW LEVEL SECURITY;

-- Afwijking van het 202-patroon: BEWUST geen anon-leespolicy. De omzetmix per locatie is
-- commercieel gevoelig en de anon key staat in de browser. Alleen authenticated leest/schrijft.
DROP POLICY IF EXISTS channel_mix_auth_all ON channel_mix;
CREATE POLICY channel_mix_auth_all ON channel_mix FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON channel_mix FROM anon;

-- ---------------------------------------------------------------------------
-- 2. current_channel_mix — de mix die vandaag geldt, genormaliseerd naar 100%
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW current_channel_mix AS
WITH active AS (
  -- per locatie/kanaal de meest recente periode die vandaag omvat
  SELECT DISTINCT ON (cm.location_id, cm.channel)
    cm.location_id, cm.channel, cm.share_pct, cm.period_start, cm.period_end, cm.updated_at
  FROM channel_mix cm
  WHERE cm.period_start <= CURRENT_DATE
    AND (cm.period_end IS NULL OR cm.period_end >= CURRENT_DATE)
  ORDER BY cm.location_id, cm.channel, cm.period_start DESC
)
SELECT
  a.location_id,
  l.name AS location_name,
  a.channel,
  a.share_pct,
  CASE
    WHEN SUM(a.share_pct) OVER (PARTITION BY a.location_id) > 0
      THEN a.share_pct / SUM(a.share_pct) OVER (PARTITION BY a.location_id)
    ELSE NULL
  END AS weight,
  a.period_start,
  a.period_end,
  a.updated_at
FROM active a
JOIN locations l ON l.id = a.location_id;

-- views draaien als owner; de mix-aandelen dus ook hier niet naar anon
REVOKE ALL ON current_channel_mix FROM anon;

COMMENT ON VIEW current_channel_mix IS
  'De verkoopmix die vandaag geldt, per locatie, met genormaliseerd gewicht (som = 1). Bron: channel_mix (warehouse).';

-- ---------------------------------------------------------------------------
-- 3. computed_menu_item_channel_food_cost — food cost per menu-item per kanaal
-- ---------------------------------------------------------------------------
-- Rekenwijze (zelfde uitgangspunten als het Excel-model, zie 202):
--   verkoopprijs is INCL. BTW  ->  netto omzet = prijs / (1 + btw%) - commissie
--   commissie is % van de online prijs INCL. BTW
--   kostprijs krijgt de waste-opslag van het kanaal
-- BTW: alle menu-items worden als food behandeld (vat_rate_food). Er is geen alcohol-vlag
-- op menu_items; komt die er, dan hier vat_rate_alcohol koppelen.

CREATE OR REPLACE VIEW computed_menu_item_channel_food_cost AS
WITH base AS (
  SELECT
    f.menu_item_id,
    f.menu_item_name,
    f.computed_cost_cents,
    f.missing_price_lines,
    cs.channel,
    cs.display_name AS channel_display_name,
    cs.vat_rate_food,
    cs.commission_pct,
    cs.waste_pct,
    -- instore valt terug op menu_items.price_cents (de instore prijs, zie 202/204)
    COALESCE(mcp.price_cents, CASE WHEN cs.channel = 'instore' THEN f.price_cents END) AS price_cents
  FROM computed_menu_item_food_cost f
  CROSS JOIN channel_settings cs
  LEFT JOIN menu_item_channel_prices mcp
    ON mcp.menu_item_id = f.menu_item_id AND mcp.channel = cs.channel
),
calc AS (
  SELECT
    b.*,
    ROUND(b.computed_cost_cents * (1 + b.waste_pct / 100.0), 3) AS cost_incl_waste_cents,
    CASE
      WHEN b.price_cents IS NULL THEN NULL
      ELSE ROUND(
        b.price_cents / (1 + b.vat_rate_food / 100.0)
        - b.price_cents * (b.commission_pct / 100.0), 3)
    END AS net_revenue_cents
  FROM base b
)
SELECT
  c.menu_item_id,
  c.menu_item_name,
  c.channel,
  c.channel_display_name,
  c.price_cents,
  c.computed_cost_cents,
  c.cost_incl_waste_cents,
  c.net_revenue_cents,
  CASE
    WHEN c.net_revenue_cents IS NULL OR c.net_revenue_cents <= 0 THEN NULL
    ELSE ROUND((c.cost_incl_waste_cents / c.net_revenue_cents) * 100.0, 2)
  END AS food_cost_pct,
  c.missing_price_lines
FROM calc c;

COMMENT ON VIEW computed_menu_item_channel_food_cost IS
  'Food cost per menu-item per verkoopkanaal: kostprijs incl. waste gedeeld door netto omzet (prijs excl. BTW minus platformcommissie). Prijs ontbreekt -> food_cost_pct NULL.';

-- ---------------------------------------------------------------------------
-- 4. computed_menu_item_blended_food_cost — gewogen food cost per locatie
-- ---------------------------------------------------------------------------
-- Blend = (gewogen kostprijs incl. waste) / (gewogen netto omzet). Alleen kanalen met
-- een prijs tellen mee; de gewichten worden over díe kanalen opnieuw genormaliseerd,
-- zodat een item dat niet online staat geen kunstmatig lage food cost krijgt.

CREATE OR REPLACE VIEW computed_menu_item_blended_food_cost AS
WITH joined AS (
  SELECT
    m.location_id,
    m.location_name,
    c.menu_item_id,
    c.menu_item_name,
    c.channel,
    m.weight,
    c.price_cents,
    c.cost_incl_waste_cents,
    c.net_revenue_cents,
    c.computed_cost_cents,
    c.missing_price_lines
  FROM current_channel_mix m
  JOIN computed_menu_item_channel_food_cost c ON c.channel = m.channel
  WHERE m.weight IS NOT NULL
    AND c.net_revenue_cents IS NOT NULL
    AND c.net_revenue_cents > 0
)
SELECT
  j.location_id,
  j.location_name,
  j.menu_item_id,
  j.menu_item_name,
  MAX(j.computed_cost_cents) AS computed_cost_cents,
  ROUND(SUM(j.weight * j.cost_incl_waste_cents) / NULLIF(SUM(j.weight), 0), 3) AS blended_cost_cents,
  ROUND(SUM(j.weight * j.net_revenue_cents) / NULLIF(SUM(j.weight), 0), 3) AS blended_net_revenue_cents,
  CASE
    WHEN SUM(j.weight * j.net_revenue_cents) > 0
      THEN ROUND((SUM(j.weight * j.cost_incl_waste_cents) / SUM(j.weight * j.net_revenue_cents)) * 100.0, 2)
    ELSE NULL
  END AS blended_food_cost_pct,
  -- aandeel van de mix dat daadwerkelijk meetelt (kanalen zonder prijs vallen af)
  ROUND(SUM(j.weight) * 100.0, 1) AS covered_mix_pct,
  COUNT(*) AS channels_counted,
  MAX(j.missing_price_lines) AS missing_price_lines
FROM joined j
GROUP BY j.location_id, j.location_name, j.menu_item_id, j.menu_item_name;

COMMENT ON VIEW computed_menu_item_blended_food_cost IS
  'Gewogen food cost per menu-item per locatie, op basis van de werkelijke verkoopmix (channel_mix). covered_mix_pct < 100 betekent dat een deel van de mix een kanaal is waarvoor dit item geen prijs heeft.';

REVOKE ALL ON computed_menu_item_blended_food_cost FROM anon;
