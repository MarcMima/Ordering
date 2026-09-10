-- Marc, 09/10-09-2026: maandag is op alle locaties de vaste dag van de weekly stocktake én
-- van de weekbestellingen (GéDé, Tuana, Today Food Group). Het locatieveld stond leeg,
-- waardoor de bestelpagina nooit een "weekly kitchen day" zag en Tuana/TFG alleen via
-- "Allow ordering today" te versturen waren. Alle weekly items staan al op dow 1.
UPDATE locations SET weekly_stocktake_day_of_week = 1 WHERE weekly_stocktake_day_of_week IS NULL;
