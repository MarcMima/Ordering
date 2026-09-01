-- Shared secrets for inbound integrations that cannot carry a Supabase session
-- (e.g. the Google Apps Script that posts the weekly Bidfood assortment file).
-- Only the SHA-256 hash of the token is stored; service role reads it.

CREATE TABLE IF NOT EXISTS integration_tokens (
  name TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

COMMENT ON TABLE integration_tokens IS
  'Hashed shared tokens for inbound webhooks. No client-side access: service role only.';

ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: anon/authenticated cannot read or write.
