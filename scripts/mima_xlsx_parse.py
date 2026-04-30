#!/usr/bin/env python3
"""
Parse .xlsx using only stdlib (zipfile + xml). No openpyxl dependency.
Outputs JSON with sheet grids for inspection and mapping.
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_REL_PKG = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def col_row_from_cellref(ref: str) -> tuple[int, int]:
    m = re.match(r"^([A-Z]+)(\d+)$", ref.strip().upper())
    if not m:
        return 0, 0
    col_s, row_s = m.group(1), m.group(2)
    col = 0
    for c in col_s:
        col = col * 26 + (ord(c) - ord("A") + 1)
    return col - 1, int(row_s) - 1


def load_shared_strings(z: zipfile.ZipFile) -> list[str]:
    try:
        data = z.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(data)
    out: list[str] = []
    for si in root.findall(f"{NS_MAIN}si"):
        parts: list[str] = []
        for t in si.iter():
            if t.tag == f"{NS_MAIN}t" and t.text:
                parts.append(t.text)
            elif t.tag == f"{NS_MAIN}t" and t.tail:
                parts.append(t.tail)
        if not parts:
            # single t directly under si
            t = si.find(f"{NS_MAIN}t", {"": NS_MAIN[1:-1]})
            if t is None:
                t = si.find(f"{NS_MAIN}t")
            if t is not None and t.text:
                parts.append(t.text)
        out.append("".join(parts) if parts else "")
    return out


def cell_value(c: ET.Element, shared: list[str]) -> str | float | None:
    t = c.get("t")
    v_el = c.find(f"{NS_MAIN}v")
    if v_el is None or v_el.text is None:
        return None
    raw = v_el.text
    if t == "s":
        try:
            return shared[int(raw)]
        except (ValueError, IndexError):
            return raw
    if t == "inlineStr":
        is_el = c.find(f"{NS_MAIN}is")
        if is_el is not None:
            t_el = is_el.find(f".//{NS_MAIN}t")
            if t_el is not None and t_el.text:
                return t_el.text
        return None
    # number or plain
    try:
        if "." in raw or "e" in raw.lower():
            return float(raw)
        return int(raw)
    except ValueError:
        return raw


def load_workbook_rels(z: zipfile.ZipFile) -> dict[str, str]:
    """rId -> target path relative to xl/"""
    data = z.read("xl/_rels/workbook.xml.rels")
    root = ET.fromstring(data)
    out: dict[str, str] = {}
    for rel in root:
        if "Relationship" not in rel.tag:
            continue
        rid = rel.get("Id")
        tgt = rel.get("Target")
        if rid and tgt:
            out[rid] = tgt.replace("../", "xl/") if not tgt.startswith("xl/") else tgt
    return out


def sheet_name_to_path(z: zipfile.ZipFile) -> list[tuple[str, str]]:
    data = z.read("xl/workbook.xml")
    root = ET.fromstring(data)
    rels = load_workbook_rels(z)
    sheets_el = root.find(f"{NS_MAIN}sheets")
    if sheets_el is None:
        return []
    out: list[tuple[str, str]] = []
    for sh in sheets_el.findall(f"{NS_MAIN}sheet"):
        name = sh.get("name") or ""
        rid = sh.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        if not rid or rid not in rels:
            continue
        path = rels[rid]
        if not path.startswith("xl/"):
            path = "xl/" + path.lstrip("/")
        out.append((name, path))
    return out


def read_sheet(z: zipfile.ZipFile, path: str, shared: list[str], max_rows: int = 500) -> list[list[Any]]:
    try:
        data = z.read(path)
    except KeyError:
        return []
    root = ET.fromstring(data)
    sheet_data = root.find(f"{NS_MAIN}sheetData")
    if sheet_data is None:
        return []
    grid: dict[tuple[int, int], Any] = {}
    max_r, max_c = 0, 0
    for row in sheet_data.findall(f"{NS_MAIN}row"):
        for c in row.findall(f"{NS_MAIN}c"):
            ref = c.get("r")
            if not ref:
                continue
            col, r = col_row_from_cellref(ref)
            val = cell_value(c, shared)
            grid[(r, col)] = val
            max_r = max(max_r, r)
            max_c = max(max_c, col)
    if max_r < 0:
        return []
    out: list[list[Any]] = []
    for r in range(min(max_r + 1, max_rows)):
        row_vals: list[Any] = []
        for c in range(max_c + 1):
            row_vals.append(grid.get((r, c)))
        # trim trailing Nones
        while row_vals and row_vals[-1] is None:
            row_vals.pop()
        out.append(row_vals)
    return out


def parse_xlsx(path: Path) -> dict[str, Any]:
    out: dict[str, Any] = {"file": str(path), "sheets": {}}
    with zipfile.ZipFile(path, "r") as z:
        shared = load_shared_strings(z)
        out["shared_string_count"] = len(shared)
        for name, spath in sheet_name_to_path(z):
            rows = read_sheet(z, spath, shared)
            out["sheets"][name] = rows
    return out


def main() -> None:
    import os

    home = Path.home()
    default_menu = home / "Documents/Marc/Mima/Menu/Menu/251126_Menu.xlsx"
    default_nv = home / "Documents/Marc/Mima/Menu/Nutritional values/260309_Voedingswaarde Mima.xlsx"
    paths = [
        Path(os.environ.get("MIMA_XLSX_MENU", str(default_menu))),
        Path(os.environ.get("MIMA_XLSX_VOEDING", str(default_nv))),
    ]
    for p in paths:
        if not p.exists():
            print(f"SKIP missing: {p}", file=sys.stderr)
            continue
        data = parse_xlsx(p)
        stem = p.stem.replace(" ", "_")
        out_json = Path(__file__).resolve().parent.parent / "scripts" / f"parsed_{stem}.json"
        # JSON: convert None for readability
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=0, default=str)
        print(f"Wrote {out_json} ({len(data['sheets'])} sheets)")


if __name__ == "__main__":
    main()
