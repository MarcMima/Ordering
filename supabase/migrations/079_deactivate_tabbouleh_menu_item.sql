-- Tabbouleh wordt niet meer geserveerd — verberg op kaart (kitchen filtert op active).

UPDATE menu_items
SET active = false,
    updated_at = NOW()
WHERE lower(btrim(name)) = 'tabbouleh';
