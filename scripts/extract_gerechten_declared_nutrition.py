#!/usr/bin/env python3
"""
Leest 'Gerechten' uit geparste Voedingswaarde JSON en produceert:
- scripts/gerechten_declared_nutrition.json (per menu-item)
- Voorgestelde SQL (stdout) voor migratie

Bron: 260309_Voedingswaarde Mima.xlsx → eerst mima_xlsx_parse.py draaien.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def norm_menu_name(family: str | None, variant: str | None) -> str | None:
    if not variant:
        return None
    v = str(variant).strip()
    f = (family or "").strip()
    if f.lower().startswith("flatbread"):
        return f"Flatbread {v}"
    if f.lower().startswith("pita"):
        return f"Pita {v}"
    return None


def parse_gerechten(rows: list) -> list[dict]:
    out: list[dict] = []
    current_family: str | None = None
    i = 0
    while i < len(rows):
        r = rows[i]
        if not r or len(r) < 4:
            i += 1
            continue
        if r[2] == "Quantity" and r[3] == "Grams":
            fam = r[0]
            var = r[1]
            if fam:
                current_family = str(fam).strip()
            mn = norm_menu_name(current_family, var)
            j = i + 1
            while j < len(rows):
                r2 = rows[j]
                if not r2 or len(r2) < 12:
                    j += 1
                    continue
                if r2[1] == "Totaal":
                    nums = [r2[k] for k in range(3, 12)]
                    out.append(
                        {
                            "excel_block_row": i,
                            "family": current_family,
                            "variant": str(var).strip() if var else None,
                            "menu_item_name": mn,
                            "grams": nums[0],
                            "kcal": nums[1],
                            "protein_g": nums[2],
                            "carbs_g": nums[3],
                            "sugar_g": nums[4],
                            "fat_g": nums[5],
                            "sat_fat_g": nums[6],
                            "fiber_g": nums[7],
                            "salt_g": nums[8],
                        }
                    )
                    break
                j += 1
        i += 1
    return out


def round_decl(d: dict) -> dict:
    def ri(x):
        if x is None:
            return None
        return int(round(float(x)))

    def r1(x):
        if x is None:
            return None
        return round(float(x), 1)

    return {
        **d,
        "kcal_r": ri(d.get("kcal")),
        "protein_g_r": ri(d["protein_g"]),
        "carbs_g_r": ri(d["carbs_g"]),
        "sugar_g_r": ri(d["sugar_g"]),
        "fat_g_r": ri(d["fat_g"]),
        "sat_fat_g_r": ri(d["sat_fat_g"]),
        "fiber_g_r": ri(d["fiber_g"]),
        "salt_g_r": r1(d["salt_g"]) if d.get("salt_g") is not None else None,
    }


def main() -> None:
    path = ROOT / "scripts" / "parsed_260309_Voedingswaarde_Mima.json"
    if not path.exists():
        print("Run: python3 scripts/mima_xlsx_parse.py", file=sys.stderr)
        sys.exit(1)
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data["sheets"].get("Gerechten", [])
    blocks = parse_gerechten(rows)
    flat_pita = [round_decl(b) for b in blocks if b.get("menu_item_name")]

    out_path = ROOT / "scripts" / "gerechten_declared_nutrition.json"
    out_path.write_text(json.dumps(flat_pita, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path} ({len(flat_pita)} blocks with totals)")

    print("\n-- Copy for migration (flatbread + pita only, first 8 blocks):\n")
    for b in flat_pita[:8]:
        n = b["menu_item_name"]
        if not n:
            continue
        print(
            f"-- {n} (Excel {b.get('family')} / {b.get('variant')}) "
            f"kcal={b['kcal_r']} protein={b['protein_g_r']} ..."
        )


if __name__ == "__main__":
    main()
