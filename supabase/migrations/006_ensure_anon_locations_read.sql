-- Zorg dat anon gebruikers locations kunnen lezen (o.a. voor dashboard dropdown).
-- Idempotent: verwijder bestaande policy en maak opnieuw aan.
DROP POLICY IF EXISTS "Allow read for anon on locations" ON locations;
CREATE POLICY "Allow read for anon on locations"
  ON locations FOR SELECT TO anon USING (true);
