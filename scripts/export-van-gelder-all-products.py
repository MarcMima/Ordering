#!/usr/bin/env python3
"""Export ALL Van Gelder products (artikelnummer, EAN, naam) via Articles API.

Van Gelder has no bulk articles list that returns data on prod; we scan the
numeric article-id range and collect every hit.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from openpyxl import Workbook

REPO = Path(__file__).resolve().parents[1]
OUT_XLSX = REPO / "docs" / "van-gelder-all-products.xlsx"
OUT_JSON = REPO / "tmp_vg_all_products.json"
PROGRESS_PATH = REPO / "tmp_vg_all_products_progress.json"

IMPORT_URL = (
    "https://olcqzhxirqhkfgzgjnnw.supabase.co/functions/v1/import-van-gelder"
)
APIKEY = "sb_publishable_Xd6i1yV5VKNbYb9fz5eHyw_wRV7IYqu"

ID_START = 100_000
ID_END = 270_000
WORKERS = 40


def fetch_article(article_id: int) -> dict | None:
    payload = json.dumps({"api": "articles", "articleId": str(article_id)}).encode()
    req = urllib.request.Request(
        IMPORT_URL,
        data=payload,
        headers={"Content-Type": "application/json", "apikey": APIKEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            obj = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    if obj.get("status") != 200:
        return None

    data = obj.get("data")
    if not isinstance(data, dict):
        return None
    articles = data.get("Article")
    if not isinstance(articles, list) or not articles:
        return None

    row = articles[0]
    return {
        "artikelnummer": str(row.get("Id") or article_id),
        "ean": str(row.get("EAN") or "").strip(),
        "naam": str(row.get("Name") or "").strip(),
        "product_status": str(row.get("ProductStatus") or "").strip(),
        "unit_of_measurement": str(row.get("UnitOfMeasurement") or "").strip(),
        "units": row.get("Units"),
    }


def save_outputs(rows: list[dict]) -> None:
    rows_sorted = sorted(rows, key=lambda r: (r.get("naam") or "").lower())
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(rows_sorted, ensure_ascii=False, indent=2))

    wb = Workbook()
    ws = wb.active
    ws.title = "Alle_producten"
    ws.append(["artikelnummer", "ean", "naam", "product_status", "unit_of_measurement", "units"])
    for r in rows_sorted:
        ws.append(
            [
                r.get("artikelnummer"),
                r.get("ean"),
                r.get("naam"),
                r.get("product_status"),
                r.get("unit_of_measurement"),
                r.get("units"),
            ]
        )
    OUT_XLSX.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT_XLSX)


def main() -> int:
    codes = list(range(ID_START, ID_END + 1))
    total = len(codes)
    found: list[dict] = []
    seen_ids: set[str] = set()
    checked = 0
    started = time.time()

    print(
        f"Scanning Van Gelder article IDs {ID_START}..{ID_END} "
        f"({total} codes, {WORKERS} workers)"
    )

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(fetch_article, code): code for code in codes}
        for fut in as_completed(futures):
            checked += 1
            row = fut.result()
            if row:
                aid = row["artikelnummer"]
                if aid not in seen_ids:
                    seen_ids.add(aid)
                    found.append(row)

            if checked % 5000 == 0 or checked == total:
                elapsed = time.time() - started
                rate = checked / elapsed if elapsed > 0 else 0
                PROGRESS_PATH.write_text(
                    json.dumps(
                        {
                            "checked": checked,
                            "total": total,
                            "found": len(found),
                            "elapsed_sec": round(elapsed, 1),
                            "rate_per_sec": round(rate, 2),
                            "eta_min": round((total - checked) / rate / 60, 1) if rate else None,
                        },
                        indent=2,
                    )
                )
                print(
                    f"  {checked}/{total} — {len(found)} producten — "
                    f"{rate:.1f}/s — ETA {((total-checked)/rate/60):.0f} min"
                    if rate
                    else f"  {checked}/{total} — {len(found)} producten",
                    flush=True,
                )

    save_outputs(found)
    print(f"Klaar: {len(found)} producten")
    print(f"  Excel: {OUT_XLSX}")
    print(f"  JSON:  {OUT_JSON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
