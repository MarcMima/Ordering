#!/usr/bin/env python3
"""
Vergelijkt Product-namen uit geparste Excel Grondstoffen met een vaste lijst DB-namen
(uit migratie 034). Schrijft scripts/grondstoffen_mapping_hints.txt
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Bekende raw_ingredients uit 034 (lower)
DB_RAW = {
    "onion peeled", "tomato", "flaxseed broken", "red onion sliced fine", "red cabbage shredded",
    "coriander", "parsley", "cucumber", "green lentils", "carrot julienne", "mint", "green chili",
    "aubergine", "romaine lettuce", "pomegranate seeds", "garlic puree", "eggs", "garlic peeled",
    "celery brunoise", "chickpeas", "red lentils", "chicken", "pita bread 15 cm",
    "whole wheat pita bread 15 cm", "feta cheese", "greek yoghurt 10%", "tomato puree",
    "oat drink barista", "vanilla extract", "rice flour", "middle eastern pickles", "sunflower oil",
    "msg (ve tsin)", "stock", "eggplant puree", "kalamata olives", "lemon juice", "flatbread",
    "rice basmati", "bulgur", "olive oil", "tahini", "vinegar", "cumin", "turmeric", "black pepper",
    "chili powder", "cardamom", "sumac", "mustard powder", "salt", "sugar white", "sugar brown",
    "all purpose flour", "baking powder", "baking soda",
}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def main() -> None:
    path = ROOT / "scripts" / "parsed_260309_Voedingswaarde_Mima.json"
    if not path.exists():
        print("Ontbreekt:", path)
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data["sheets"].get("Grondstoffen", [])
    products: list[str] = []
    for r in rows[1:]:
        if not r or r[0] is None:
            continue
        products.append(str(r[0]).strip())

    lines = [
        "Grondstoffen Excel vs DB (hints; DB-lijst = subset migratie 034)",
        "============================================================",
        "",
    ]
    for p in products:
        n = norm(p)
        if n in DB_RAW:
            lines.append(f"[OK exact] {p}")
            continue
        # substring heuristiek
        hit = [d for d in DB_RAW if n in d or d in n]
        if len(hit) == 1:
            lines.append(f"[~ misschien] Excel={p!r} -> DB zou kunnen: {hit[0]}")
        elif hit:
            lines.append(f"[? meerdere] Excel={p!r} -> kandidaten: {', '.join(sorted(hit))}")
        else:
            lines.append(f"[!! geen match] Excel={p!r}")

    out = ROOT / "scripts" / "grondstoffen_mapping_hints.txt"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {out} ({len(products)} products)")


if __name__ == "__main__":
    main()
