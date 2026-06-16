#!/usr/bin/env python3
"""Convert export-van-gelder-products JSON response to Excel."""
import json
import sys
from pathlib import Path

from openpyxl import Workbook

inp = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tmp_vg_all_products_response.json")
out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("docs/van-gelder-all-products.xlsx")

obj = json.loads(inp.read_text())
products = obj.get("products") or []
wb = Workbook()
ws = wb.active
ws.title = "Alle_producten"
ws.append(["artikelnummer", "ean", "naam", "product_status", "unit_of_measurement", "units"])
for p in products:
    ws.append([
        p.get("artikelnummer"),
        p.get("ean"),
        p.get("naam"),
        p.get("product_status"),
        p.get("unit_of_measurement"),
        p.get("units"),
    ])
out.parent.mkdir(parents=True, exist_ok=True)
wb.save(out)
print(f"Wrote {len(products)} rows to {out}")
