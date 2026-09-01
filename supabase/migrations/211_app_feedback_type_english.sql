-- app_feedback.type naar Engelse waarden: alle UI-tekst in de app is Engels, en de
-- opgeslagen waarde hoorde daar niet van af te wijken.
--
-- De tabel is leeg (geverifieerd bij het uitrollen van 209), dus geen datamigratie.
-- Voor de zekerheid alsnog een idempotente hermapping vóór de nieuwe CHECK, zodat
-- deze migratie ook klopt als er inmiddels wél een rij in staat.

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_type_check;

UPDATE app_feedback SET type = 'problem' WHERE type = 'probleem';
UPDATE app_feedback SET type = 'idea'    WHERE type = 'idee';
UPDATE app_feedback SET type = 'other'   WHERE type = 'anders';

ALTER TABLE app_feedback
  ADD CONSTRAINT app_feedback_type_check
  CHECK (type IN ('problem', 'idea', 'other'));
