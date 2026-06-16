-- Alleen uitvoeren op staging / lokaal testproject. NIET op productie.
-- Zet alle Bidfood API-kanalen naar Bidfood sandbox (zelfde klant als test-PDF).
-- Alternatief: laat DB op productie-URL staan en gebruik Edge secret BIDFOOD_USE_SANDBOX=1.

UPDATE supplier_order_channels
SET
  api_base_url = 'https://bas.staging.bidfood.nl/sandbox',
  api_customer_code = '000040',
  updated_at = NOW()
WHERE channel = 'bidfood_api';
