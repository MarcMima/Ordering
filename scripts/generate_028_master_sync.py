#!/usr/bin/env python3
"""Generate supabase/migrations/028_sync_master_catalog_from_sheet.sql from embedded TSV."""
from __future__ import annotations

import textwrap

# Paste from user (tab-separated). weekly column: 0/1/empty
TSV = r"""
product	stocktaking_unit	stocktaking_content_amount	stocktaking_content_unit	ordering_unit	ordering_content_amount	ordering_content_unit	supplier	visible	weekly
Onion peeled	bag	1	kg				Van Gelder	1	0
Tomato	box	1	kg				Van Gelder	1	0
Flaxseed broken	container	0.85	kg				Van Gelder	1	0
Red onion sliced fine	Bag	1	kg				Van Gelder	1	0
Red cabbage shredded	bag	2.5	kg				Van Gelder	1	0
Coriander	kg	1	kg				Van Gelder	1	0
Parsley	kg	1	kg				Van Gelder	1	0
Cucumber	box	1	kg				Van Gelder	1	0
Green lentils	bag	10	kg				Van Gelder	1	0
Carrot julienne	bag	1	kg				Van Gelder	1	0
Mint	bag	1	kg				Van Gelder	1	0
Green chili	tray	500	g				Van Gelder	1	0
Aubergine	box	1	kg				Van Gelder	1	0
Romaine lettuce	box	1	kg				Van Gelder	1	0
Pomegranate seeds	container	1	kg				Van Gelder	1	0
Garlic puree	container	1	kg				Van Gelder	1	0
Eggs	tray	30	piece				Van Gelder	1	0
Garlic peeled	bag	1	kg				Van Gelder	1	0
Celery brunoise	bag	1	kg				Van Gelder	1	0
Chickpeas	bag	10	kg				Van Gelder	1	0
Red lentils	bag	500	g				Van Gelder	1	0
Chicken	container	5	kg				Bidfood	1	0
Pita bread 15 cm	box	50	piece				Bidfood	1	0
Whole wheat pita bread 15 cm	box	50	piece				Bidfood	1	0
Feta cheese	pack	1.6	kg				Bidfood	1	0
Greek yoghurt 10%	bucket	1	kg				Bidfood	1	0
Tomato puree	can	800	g				Bidfood	1	0
Oat drink barista	carton	1	l				Bidfood	1	0
Vanilla extract	bottle	1	l				Bidfood	1	0
Rice flour	box	10	kg				Bidfood	1	0
Middle Eastern pickles	can	3	kg				Bidfood	1	0
Sunflower oil	bottle	5	l				Bidfood	1	0
MSG (Ve Tsin)	box	2	kg				Bidfood	1	0
Stock	container	1	kg				Bidfood	1	0
Eggplant puree	can	2.83	kg				Bidfood	1	0
Kalamata olives	jar	5.2	kg				Bidfood	1	0
Lemon juice	bottle	1	l				Bidfood	1	0
Coca Cola	tray	24	piece				Bidfood	1	0
Coca Cola Zero	tray	24	piece				Bidfood	1	0
SOOF Mint	tray	12	piece				Bidfood	1	0
SOOF Cardamom	tray	12	piece				Bidfood	1	0
SOOF Lavender	tray	12	piece				Bidfood	1	0
Sparkling water	tray	18	piece				Bidfood	1	0
Still water	tray	24	piece				Bidfood	1	0
Hand soap	can	5	l				Bidfood	0	1
All purpose flour	bag	1	kg				Bidfood	1	
Baking powder	can	1	kg				Bidfood	1	
Baking soda	box	454	g				Bidfood	1	
Cumin	pack	1	kg				Tuana	1	
Za'atar	pack	1	kg				Tuana	1	
Turmeric	pack	1	kg				Tuana	1	
Black pepper	pack	1	kg				Tuana	1	
Chili powder	pack	1	kg				Tuana	1	
Cardamom	pack	1	kg				Tuana	1	
Sumac	pack	1	kg				Tuana	1	
Mustard powder	pack	1	kg				Tuana	1	
Salt	bucket	5	kg				Bidfood	1	
Sugar white	bag	1	kg				Bidfood	1	
Sugar brown	bag	1	kg				Bidfood	1	
Tahini	bucket	18	kg				Today Food Group	1	
Vinegar	jerrycan	10	l				Bidfood	1	
Flatbread	bag	1	kg				Java bakery	1	
Rice basmati	bag	1	kg				Bidfood	1	
Bulgur	bag	1	kg				Bidfood; Van Gelder	1	
Olive oil	bottle	1	l				Bidfood; Van Gelder	1	
Paper bags large	Box	250	pcs				GéDé	1	1
Lids (bowl)	Sleeve	50	pcs	box	5	sleeves	GéDé	1	1
Lids (pita)	Sleeve	50	pcs		5	sleeves	GéDé	1	1
Paper bags small	Box	250	pcs				GéDé	1	1
Rolling paper	Pack	8	kg				GéDé	1	1
Paper bag (brownies)	Box	1450	pcs				GéDé	1	1
Pita pouches	Box	2000	pcs				GéDé	1	1
Mezze container	Sleeve	50	pcs	box	10	sleeves	GéDé	1	1
Mezze lids	Sleeve	50	pcs	box	10	sleeves	GéDé	1	1
Sauce cup	Sleeve	100	pcs	box	10	sleeves	GéDé	1	1
Sauce lid	Sleeve	100	pcs	box	10	sleeves	GéDé	1	1
Falafel container	Sleeve	50	pcs	box	6	sleeves	GéDé	1	1
Pita container	Sleeve	50	pcs	box	6	sleeves	GéDé	1	1
Bowl container	Sleeve	50	pcs	box	6	sleeves	GéDé	1	1
Catering container	Sleeve	50	pcs	box	4	sleeves	GéDé	1	1
Cutlery	Bag	250	pcs				GéDé	1	1
Stirrer	Box	1000	pcs				GéDé	1	1
Coffee cup	Sleeve	50	pcs				GéDé	1	1
Coffee lids	Sleeve	50	pcs				GéDé	1	1
Napkins	Sleeve	500	pcs	box	2000	pcs	GéDé	1	1
Soup container	Sleeve	50	pcs				GéDé	1	1
Soup lids	Sleeve	50	pcs				GéDé	1	1
Aluminium foil	Roll	1	roll	box	4	rolls	GéDé	1	1
Clingfilm	Roll	1	roll	box	3	rolls	GéDé	1	1
Microfiber cloth	Piece	1	cloth	box	20	pcs	GéDé	1	1
Centerfeed paper roll	Roll	1	Roll	box	6	rolls	GéDé	1	1
Toiletpaper	Roll	1	Roll	box	20	rolls	GéDé	1	1
Gloves small	Box	100	pcs	Box	1	pcs	GéDé	1	1
Gloves medium	Box	100	pcs	Box	1	pcs	GéDé	1	1
Gloves large	Box	100	pcs	Box	1	pcs	GéDé	1	1
Daysticker Monday	Roll	1000	stickers				GéDé	1	1
Daysticker Tuesday	Roll	1000	stickers				GéDé	1	1
Daysticker Wednesday	Roll	1000	stickers				GéDé	1	1
Daysticker Thursday	Roll	1000	stickers				GéDé	1	1
Daysticker Friday	Roll	1000	stickers				GéDé	1	1
Daysticker Saturday	Roll	1000	stickers				GéDé	1	1
Daysticker Sunday	Roll	1000	stickers				GéDé	1	1
Aluminium foil dispenser	Unit	1	unit				GéDé	1	1
Flatbreadchips bags with window	Stack	50	pieces	Box	10	stacks	GéDé	1	1
Shifka peppers	can	3	kg				Bidfood	1	0
Mango	bag	1	kg				Bidfood	1	0
Cacao powder	box	3.5	kg				Van Gelder	1	0
Coriander (fresh)	bag	1	kg				Van Gelder	1	0
Cauliflower	bag	2.5	kg				Bidfood	1	0
Yoghurt	tub	1	kg				Bidfood	1	0
Rice pandan	bag	4.5	kg				Bidfood	1	0
Rose petals	bag	0.5	kg				Tuana	1	0
Dried dill	pack	0.5	kg				Tuana	1	0
Xantana	pack	0.5	kg				Bidfood	1	0
""".strip()


def esc(s: str) -> str:
    return s.replace("'", "''")


def norm_unit(u: str) -> str:
    x = (u or "").strip().lower()
    if x in ("piece", "pieces", "pcs"):
        return "pcs"
    if x in ("kg", "g", "l", "ml"):
        return x
    if x in ("roll", "rolls"):
        return "pcs"  # count rolls as pcs in DB; label shows Roll
    if x in ("sleeve", "sleeves"):
        return "pcs"
    if x in ("stack", "stacks"):
        return "pcs"
    if x in ("stickers", "sticker"):
        return "pcs"
    if x in ("cloth",):
        return "pcs"
    if x in ("unit", "units"):
        return "pcs"
    return x or "pcs"


def raw_base_unit(st_cu: str) -> str:
    x = (st_cu or "").strip().lower()
    if x in ("kg", "g"):
        return "g"
    if x in ("l", "ml"):
        return "ml"
    if x in (
        "piece",
        "pieces",
        "pcs",
        "roll",
        "rolls",
        "stickers",
        "sticker",
        "cloth",
        "unit",
        "units",
        "stack",
        "stacks",
        "sleeve",
        "sleeves",
    ):
        return "pcs"
    return "pcs"


def norm_pack_size_unit(st_cu: str) -> str:
    """DB pack size_unit for conversions (app packSizeToBaseAmount)."""
    x = norm_unit(st_cu)
    if x == "piece":
        return "pcs"
    return x


def sql_literal(s: str | None) -> str:
    if s is None or str(s).strip() == "":
        return "NULL"
    return "'" + esc(str(s).strip()) + "'"


def parse_weekly(w: str) -> str:
    w = (w or "").strip()
    if w == "1":
        return "7"
    return "NULL"


def stocktake_visible_sql(visible: str) -> str:
    """Master col I: 0 = hidden from stocktake."""
    return "TRUE" if (visible or "1").strip() != "0" else "FALSE"


def stocktake_day_of_week_sql(weekly: str) -> str:
    """Master col J: weekly=1 → only Monday (1) until a dedicated weekday column exists."""
    return "1" if (weekly or "").strip() == "1" else "NULL"


def stocktake_mirror_bcd(row: dict) -> tuple[str, float, str]:
    """Master B,C,D → SQL-safe label, amount, normalized content unit (for raw_ingredients + UI)."""
    try:
        st_amt = float(row["st_amt"])
    except ValueError:
        st_amt = 1
    st_cu_raw = row["st_cu"].strip()
    st_u_norm = norm_pack_size_unit(st_cu_raw)
    raw_u = raw_base_unit(st_cu_raw)
    st_sz = st_amt
    st_u = st_u_norm
    if raw_u == "g" and st_u == "kg":
        pass
    elif raw_u == "g" and st_u == "g":
        pass
    elif raw_u == "ml" and st_u == "l":
        pass
    elif raw_u == "ml" and st_u == "ml":
        pass
    elif raw_u == "pcs":
        st_u = "pcs"
    else:
        st_u = st_u_norm
    disp_st = esc(row["st_u"].strip())
    return disp_st, st_sz, st_u


def order_pack_pcs(r) -> tuple[float | None, str | None]:
    """Return (size, size_unit) for order pack in normalized units, or (None,None)."""
    oa, ou = r["ord_amt"], r["ord_cu"]
    if oa is None or ou is None or str(ou).strip() == "":
        return None, None
    try:
        oa_f = float(oa)
    except ValueError:
        return None, None
    ou_l = str(ou).strip().lower()
    st_amt = float(r["st_amt"])
    st_cu = norm_unit(r["st_cu"])

    # Composite: box of N sleeves/stacks → N * pieces per inner unit
    if ou_l in ("sleeves", "sleeve"):
        if st_cu == "pcs":
            return oa_f * st_amt, "pcs"
    if ou_l in ("stacks", "stack"):
        if st_cu == "pcs" or st_cu == "pieces":
            return oa_f * st_amt, "pcs"
    if ou_l in ("rolls", "roll"):
        if norm_unit(r["st_cu"]) in ("roll", "rolls", "pcs") and float(r["st_amt"]) == 1:
            return oa_f * 1, "pcs"  # N rolls per box
        return oa_f, "pcs"
    if ou_l in ("pcs", "piece", "pieces"):
        return oa_f, "pcs"
    if ou_l == "kg":
        return oa_f, "kg"
    if ou_l == "g":
        return oa_f, "g"
    if ou_l == "l":
        return oa_f, "l"
    if ou_l == "ml":
        return oa_f, "ml"
    return oa_f, norm_pack_size_unit(r["st_cu"])


def main() -> None:
    lines = [ln for ln in TSV.splitlines() if ln.strip()]
    rows = []
    for ln in lines[1:]:
        parts = ln.split("\t")
        while len(parts) < 10:
            parts.append("")
        rows.append(
            {
                "product": parts[0],
                "st_u": parts[1],
                "st_amt": parts[2],
                "st_cu": parts[3],
                "ord_u": parts[4],
                "ord_amt": parts[5],
                "ord_cu": parts[6],
                "supplier": parts[7],
                "visible": parts[8] or "1",
                "weekly": parts[9],
            }
        )
    rows = [r for r in rows if r["product"].strip()]

    out = []
    out.append(
        textwrap.dedent(
            """
            -- Sync raw_ingredients + packs + supplier links from master sheet (generated by scripts/generate_028_master_sync.py).
            -- Requires 027 (pack_purpose, display_unit_label). Re-run after editing the TSV in that script.
            --
            -- Rules:
            --   - Base raw_ingredients.unit: g (weight), ml (volume), pcs (countables incl. rolls as counted units).
            --   - stocktake pack: pack_purpose = stocktake (or both if no separate order pack).
            --   - order pack: pack_purpose = order when ordering_* filled; else single pack with both.
            --   - Multi-supplier: "Bidfood; Van Gelder" → multiple supplier_ingredients rows.
            --   - weekly=1 → order_interval_days = 7; stocktake_day_of_week = 1 (Monday) until sheet has a weekday column.
            --   - visible=0 → stocktake_visible = false (master I). supplier_ingredients.is_preferred uses the same flag.
            --   - One pass per location: FOR loc_id IN SELECT id FROM locations.
            --   - Master B,C,D also on raw_ingredients (stocktake_* mirror) so stocktake UI works without pack rows.

            ALTER TABLE raw_ingredients
              ADD COLUMN IF NOT EXISTS order_interval_days INTEGER NULL;

            ALTER TABLE raw_ingredients
              ADD COLUMN IF NOT EXISTS stocktake_visible BOOLEAN NOT NULL DEFAULT true;

            ALTER TABLE raw_ingredients
              ADD COLUMN IF NOT EXISTS stocktake_day_of_week SMALLINT NULL;

            ALTER TABLE raw_ingredients
              ADD COLUMN IF NOT EXISTS stocktake_unit_label TEXT NULL;

            ALTER TABLE raw_ingredients
              ADD COLUMN IF NOT EXISTS stocktake_content_amount NUMERIC NULL;

            ALTER TABLE raw_ingredients
              ADD COLUMN IF NOT EXISTS stocktake_content_unit TEXT NULL;

            ALTER TABLE ingredient_pack_sizes
              ADD COLUMN IF NOT EXISTS grams_per_piece NUMERIC NULL;

            DO $$
            DECLARE
              loc_id UUID;
              rid UUID;
              sup_id UUID;
            BEGIN
              FOR loc_id IN SELECT id FROM locations
              LOOP
            """
        ).strip()
    )

    ind = "    "
    for row in rows:
        prod = esc(row["product"])
        st_cu_raw = row["st_cu"].strip()
        raw_u = raw_base_unit(st_cu_raw)
        ord_u_val = row["ord_u"].strip()
        ord_amt_s, ord_cu_s = row["ord_amt"].strip(), row["ord_cu"].strip()
        if row["product"].strip() == "Lids (pita)" and not ord_u_val and ord_amt_s == "5":
            ord_u_val = "box"

        oa, ou = order_pack_pcs(
            {
                "ord_amt": ord_amt_s,
                "ord_cu": ord_cu_s,
                "st_amt": row["st_amt"],
                "st_cu": row["st_cu"],
            }
        )

        # Gloves: order "1 pcs" means 1 box of 100 — treat as 100 pcs order pack
        if "Gloves" in row["product"] and ord_amt_s == "1" and ord_cu_s.lower() == "pcs":
            oa, ou = 100.0, "pcs"

        weekly_sql = parse_weekly(row["weekly"])
        vis = "true" if row["visible"].strip() != "0" else "false"
        st_vis_sql = stocktake_visible_sql(row["visible"])
        st_day_sql = stocktake_day_of_week_sql(row["weekly"])
        disp_st, st_sz, st_u = stocktake_mirror_bcd(row)
        inb = ind + "  "

        out.append(f"{ind}-- {prod}")
        out.append(
            f"{ind}SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('{prod}')) LIMIT 1;"
        )
        out.append(
            f"{ind}IF rid IS NULL THEN\n"
            f"{inb}INSERT INTO raw_ingredients (location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit)\n"
            f"{inb}VALUES (loc_id, '{prod}', '{raw_u}', {weekly_sql}, {st_vis_sql}, {st_day_sql}, '{disp_st}', {st_sz}, '{st_u}')\n"
            f"{inb}RETURNING id INTO rid;\n"
            f"{ind}ELSE\n"
            f"{inb}UPDATE raw_ingredients SET unit = '{raw_u}', order_interval_days = {weekly_sql}, stocktake_visible = {st_vis_sql}, stocktake_day_of_week = {st_day_sql}, stocktake_unit_label = '{disp_st}', stocktake_content_amount = {st_sz}, stocktake_content_unit = '{st_u}', updated_at = NOW() WHERE id = rid;\n"
            f"{ind}END IF;\n"
        )
        out.append(
            f"{ind}DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;\n"
        )

        has_order = oa is not None and ou is not None

        if has_order:
            out.append(
                f"{ind}INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)\n"
                f"{ind}VALUES (rid, {st_sz}, '{st_u}', 'stocktake', '{disp_st}');\n"
            )
            ord_disp = esc(ord_u_val or "order")
            out.append(
                f"{ind}INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)\n"
                f"{ind}VALUES (rid, {oa}, '{ou}', 'order', '{ord_disp}');\n"
            )
        else:
            out.append(
                f"{ind}INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)\n"
                f"{ind}VALUES (rid, {st_sz}, '{st_u}', 'both', '{disp_st}');\n"
            )

        out.append(f"{ind}DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;\n")
        for sup in [s.strip() for s in row["supplier"].split(";") if s.strip()]:
            sup_e = esc(sup)
            out.append(
                f"{ind}INSERT INTO suppliers (location_id, name)\n"
                f"{ind}SELECT loc_id, '{sup_e}' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('{sup_e}')));\n"
            )
            out.append(
                f"{ind}SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('{sup_e}')) LIMIT 1;\n"
                f"{ind}INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)\n"
                f"{ind}VALUES (sup_id, rid, {vis})\n"
                f"{ind}ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();\n"
            )

    out.append("  END LOOP;\nEND $$;\n")

    import os

    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    out_path = os.path.join(root, "supabase/migrations/028_sync_master_catalog_from_sheet.sql")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("Wrote", out_path, "rows", len(rows))

    # Master-only cleanup: separate migration so it runs even if 028 was already applied once.
    master_literals = ",\n    ".join(f"lower(btrim('{esc(r['product'])}'))" for r in rows)
    cleanup = f"""-- Generated by scripts/generate_028_master_sync.py — keep in sync with sheet TSV in that file.
-- Deletes every raw_ingredient that is NOT on the master sheet (no merging), for each location.
-- Run after 028. Safe to re-run: only orphans are removed.
-- Effect: prep_item_ingredients rows pointing at deleted raws are removed (CASCADE).

DO $$
DECLARE
  loc_id UUID;
BEGIN
  FOR loc_id IN SELECT id FROM locations
  LOOP
    DELETE FROM order_line_items oli
    USING raw_ingredients ri
    WHERE oli.raw_ingredient_id = ri.id
      AND ri.location_id = loc_id
      AND lower(btrim(ri.name)) NOT IN (
    {master_literals}
      );

    DELETE FROM raw_ingredients ri
    WHERE ri.location_id = loc_id
      AND lower(btrim(ri.name)) NOT IN (
    {master_literals}
      );
  END LOOP;
END $$;
"""
    cleanup_path = os.path.join(root, "supabase/migrations/031_delete_raw_ingredients_not_on_master_sheet.sql")
    with open(cleanup_path, "w", encoding="utf-8") as f:
        f.write(cleanup)
    print("Wrote", cleanup_path)

    backfill_lines = [
        "-- Backfill stocktake_visible + stocktake_day_of_week from master TSV (generated).",
        "-- Apply after 032. Updates all locations by product name match.",
        "",
    ]
    for r in rows:
        prod_e = esc(r["product"])
        st_vis = stocktake_visible_sql(r["visible"])
        st_day = stocktake_day_of_week_sql(r["weekly"])
        backfill_lines.append(
            f"UPDATE raw_ingredients SET stocktake_visible = {st_vis}, stocktake_day_of_week = {st_day} "
            f"WHERE lower(btrim(name)) = lower(btrim('{prod_e}'));"
        )
    backfill_path = os.path.join(root, "supabase/migrations/033_master_stocktake_visibility_backfill.sql")
    with open(backfill_path, "w", encoding="utf-8") as f:
        f.write("\n".join(backfill_lines) + "\n")
    print("Wrote", backfill_path)

    mirror_lines = [
        "-- Master columns B,C,D on raw_ingredients (generated). Stocktake UI reads these directly.",
        "-- Apply after 033 (or any time). Updates all rows matching each master product name.",
        "",
        "ALTER TABLE raw_ingredients ADD COLUMN IF NOT EXISTS stocktake_unit_label TEXT NULL;",
        "ALTER TABLE raw_ingredients ADD COLUMN IF NOT EXISTS stocktake_content_amount NUMERIC NULL;",
        "ALTER TABLE raw_ingredients ADD COLUMN IF NOT EXISTS stocktake_content_unit TEXT NULL;",
        "",
    ]
    for r in rows:
        prod_e = esc(r["product"])
        disp, st_sz, st_u = stocktake_mirror_bcd(r)
        mirror_lines.append(
            f"UPDATE raw_ingredients SET stocktake_unit_label = '{disp}', stocktake_content_amount = {st_sz}, "
            f"stocktake_content_unit = '{st_u}' WHERE lower(btrim(name)) = lower(btrim('{prod_e}'));"
        )
    mirror_path = os.path.join(root, "supabase/migrations/034_master_stocktake_bcd_on_raw_ingredients.sql")
    with open(mirror_path, "w", encoding="utf-8") as f:
        f.write("\n".join(mirror_lines) + "\n")
    print("Wrote", mirror_path)


if __name__ == "__main__":
    main()
