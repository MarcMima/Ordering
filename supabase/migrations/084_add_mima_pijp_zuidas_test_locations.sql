-- Add new MIMA locations for staged rollout workflow.
-- "Mima TEST" is intended as the sandbox location.

INSERT INTO locations (name)
SELECT v.name
FROM (VALUES
  ('Mima Pijp'),
  ('Mima Zuidas'),
  ('Mima TEST')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1
  FROM locations l
  WHERE lower(btrim(l.name)) = lower(btrim(v.name))
);
