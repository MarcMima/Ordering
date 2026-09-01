-- Extra reden bij een afwijking: 'suggestion_off' — de manager geeft aan dat het advies
-- zelf niet klopt. Anders dan de vier incidentele redenen verklaart deze de afwijking
-- niet weg maar bevestigt hij het structurele signaal.
--
-- Alleen de CHECK verruimen; bestaande rijen blijven geldig, dus geen datamigratie.

ALTER TABLE order_line_items
  DROP CONSTRAINT IF EXISTS order_line_items_adjustment_reason_check;
ALTER TABLE order_line_items
  ADD CONSTRAINT order_line_items_adjustment_reason_check
  CHECK (adjustment_reason IS NULL OR adjustment_reason IN (
    'promo', 'event', 'weather', 'delivery_issue', 'suggestion_off', 'other'
  ));
