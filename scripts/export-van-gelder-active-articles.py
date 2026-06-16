#!/usr/bin/env python3
"""Export all active Van Gelder articles via Articles API (prod).

Scans numeric article IDs in a range and writes an Excel file.
Requires network access to the deployed import-van-gelder edge function.
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
OUT_PATH = REPO / "docs" / "van-gelder-active-articles.xlsx"
PROGRESS_PATH = REPO / "tmp_vg_active_export_progress.json"

IMPORT_URL = (
    "https://olcqzhxirqhkfgzgjnnw.supabase.co/functions/v1/import-van-gelder"
)
APIKEY = "sb_publishable_Xd6i1yV5VKNbYb9fz5eHyw_wRV7IYqu"

ID_START = 100_000
ID_END = 260_000
WORKERS = 20

ACTIVE_STATUSES = frozenset({"available", "active", "actief"})


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
    status = str(row.get("ProductStatus") or "").strip().lower()
    if status not in ACTIVE_STATUSES:
        return None

    units = row.get("Units")
    return {
        "article_id": str(row.get("Id") or article_id),
        "name": str(row.get("Name") or "").strip(),
        "ean": str(row.get("EAN") or "").strip(),
        "secondary_ean": str(row.get("SecondaryEAN") or "").strip(),
        "product_status": str(row.get("ProductStatus") or "").strip(),
        "unit_of_measurement": str(row.get("UnitOfMeasurement") or "").strip(),
        "units": units if units is not None else "",
        "brand": str(row.get("Brand") or "").strip(),
    }


def save_excel(rows: list[dict]) -> None:
    rows_sorted = sorted(rows, key=lambda r: (r.get("name") or "").lower())
    wb = Workbook()
    ws = wb.active
    ws.title = "Active_articles"
    headers = [
        "article_id",
        "name",
        "ean",
        "secondary_ean",
        "product_status",
        "unit_of_measurement",
        "units",
        "brand",
    ]
    ws.append(headers)
    for r in rows_sorted:
        ws.append([r.get(h, "") for h in headers])
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT_PATH)


def main() -> int:
    codes = list(range(ID_START, ID_END + 1))
    total = len(codes)
    found: list[dict] = []
    checked = 0
    started = time.time()

    print(f"Scanning article IDs {ID_START}..{ID_END} ({total} codes, {WORKERS} workers)")

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(fetch_article, code): code for code in codes}
        for fut in as_completed(futures):
            checked += 1
            row = fut.result()
            if row:
                found.append(row)

            if checked % 2000 == 0 or checked == total:
                elapsed = time.time() - started
                rate = checked / elapsed if elapsed > 0 else 0
                PROGRESS_PATH.parent.mkdir(parents=True, exist_ok=True)
                PROGRESS_PATH.write_text(
                    json.dumps(
                        {
                            "checked": checked,
                            "total": total,
                            "active_found": len(found),
                            "elapsed_sec": round(elapsed, 1),
                            "rate_per_sec": round(rate, 2),
                        },
                        indent=2,
                    )
                )
                print(
                    f"  {checked}/{total} checked, {len(found)} active, "
                    f"{rate:.1f} ids/s",
                    flush=True,
                )

    save_excel(found)
    print(f"Wrote {len(found)} active articles to {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
