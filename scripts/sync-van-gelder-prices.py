#!/usr/bin/env python3
"""Van Gelder-prijzen naar ingredient_prices.

Waarom dit bestaat
------------------
De prijzen in `ingredient_prices` kwamen tot nu toe vooral uit
`excel_kostprijs_251126`, een eenmalige import uit november 2025 die als
betrouwbare bron is afgeschreven. Bidfood heeft inmiddels een wekelijkse sync,
GeDe een prijslijst, en Van Gelder had niets -- terwijl juist daar de verse
groente zit. Dit script vult dat gat.

Hoe het werkt
-------------
De Prices API van Van Gelder geeft prijzen per EAN, per klantcode, met een
begindatum en tiers. `supplier_ingredients` heeft voor 65 van de 71
Van Gelder-koppelingen een EAN, dus de match loopt daarop. Artikelnummers zijn
bewust NIET de sleutel: migratie 137 heeft die voor Van Gelder juist leeggemaakt
omdat EAN de waarheid is.

De aanroep gaat via de edge function `import-van-gelder`, net als de andere
Van Gelder-scripts. De APIM-sleutels staan in Supabase secrets en komen hier
dus niet langs.

`pack_size_grams` blijft LEEG, en dat is met opzet
---------------------------------------------------
Van Gelder prijst per verkoopeenheid: een stuk, een colli, een bos, een kilo.
De Prices API zegt niet wat die eenheid weegt. Het gewicht uit de artikelnaam
halen ("Rode Linzen 500gr stuk") zou werken tot het een keer niet werkt, en een
verkeerd gewicht levert een prijs per gram die er een factor tien naast zit --
onzichtbaar in een totaal.

Daarom blijft het veld leeg. De waardering in het data lake valt dan terug op
de prijs per verpakking en zet dat in de kolom `methode`, zodat het zichtbaar
is. Wie het exact wil, vult het verpakkingsgewicht in de app aan; dat is een
plek waar iemand het kan controleren.

Gebruik:
  cd ~/AI/Claude/mima-kitchen
  python3 scripts/sync-van-gelder-prices.py --dry-run
  python3 scripts/sync-van-gelder-prices.py
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.request
from collections import defaultdict
from datetime import date

import psycopg2

IMPORT_URL = "https://olcqzhxirqhkfgzgjnnw.supabase.co/functions/v1/import-van-gelder"
APIKEY = "sb_publishable_Xd6i1yV5VKNbYb9fz5eHyw_wRV7IYqu"
BRON = "van_gelder_prices_api"


def api_post(payload: dict, timeout: int = 180) -> dict:
    req = urllib.request.Request(
        IMPORT_URL, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "apikey": APIKEY}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def normalize_ean(v: str) -> str:
    """Zelfde normalisatie als check-van-gelder-ean-status.py: 12 cijfers krijgen
    een voorloopnul, en alleen 13 of 14 cijfers tellen als EAN."""
    d = "".join(c for c in (v or "").strip() if c.isdigit())
    if len(d) == 12:
        d = "0" + d
    return d if len(d) in (13, 14) else ""


def fetch_prices() -> dict[str, list[dict]]:
    obj = api_post({"api": "prices", "onlyActivePrices": True})
    if not obj.get("ok"):
        raise SystemExit(f"Prices API gaf geen ok terug: {str(obj)[:400]}")
    per_ean: dict[str, list[dict]] = defaultdict(list)
    for group in (obj.get("data") or {}).get("Price", []) or []:
        for line in group.get("Lines") or []:
            if line.get("Active") is False:
                continue
            ean = normalize_ean(str(line.get("Key") or ""))
            if not ean:
                continue
            tiers = line.get("Tiers") or []
            if not tiers:
                continue
            # Laagste staffel = de prijs bij een enkele eenheid. Wie meer
            # afneemt betaalt minder, maar we weten hier niet hoeveel er
            # besteld wordt, dus de veiligste aanname is de duurste tier.
            tier = min(tiers, key=lambda t: t.get("Quantity") or 1)
            waarde = tier.get("Value")
            if waarde is None:
                continue
            per_ean[ean].append({
                "prijs": float(waarde),
                "vanaf": str(line.get("StartDate") or "")[:10] or None,
                "klantcode": line.get("CustomerCode"),
                "groep": str(group.get("Type") or ""),
            })
    return per_ean


def main() -> None:
    ap = argparse.ArgumentParser(description="Van Gelder-prijzen naar ingredient_prices.")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    args = ap.parse_args()
    if not args.database_url:
        raise SystemExit("Geen DATABASE_URL. Zet hem in de omgeving of geef --database-url mee.")

    per_ean = fetch_prices()
    print(f"Prices API: {len(per_ean)} EAN's met een actieve prijs.")

    conn = psycopg2.connect(args.database_url, connect_timeout=30)
    cur = conn.cursor()
    cur.execute("""
        select si.raw_ingredient_id, si.supplier_id, si.ean_code, ri.name
        from supplier_ingredients si
        join suppliers s on s.id = si.supplier_id
        join raw_ingredients ri on ri.id = si.raw_ingredient_id
        where s.name ilike '%gelder%' and si.ean_code is not null
    """)
    koppelingen = cur.fetchall()
    print(f"App: {len(koppelingen)} Van Gelder-koppelingen met EAN.")

    vandaag = date.today()
    gevonden, gemist, rijen = 0, [], []
    for raw_id, sup_id, ean, naam in koppelingen:
        e = normalize_ean(ean)
        regels = per_ean.get(e)
        if not regels:
            gemist.append(f"{naam} ({ean})")
            continue
        # Klantspecifieke prijs wint van een groepsprijs.
        beste = sorted(regels, key=lambda r: (r["groep"].lower() == "group", r["prijs"]))[0]
        gevonden += 1
        rijen.append((raw_id, sup_id, round(beste["prijs"] * 100), beste["vanaf"] or str(vandaag),
                      f"{BRON}, EAN {e}, klant {beste['klantcode'] or '-'}"))

    print(f"Gematcht: {gevonden}. Geen actieve prijs: {len(gemist)}.")
    for g in gemist[:15]:
        print("   geen prijs:", g)

    if args.dry_run:
        for r in rijen[:10]:
            print("   ", r)
        print("\n--dry-run: niets geschreven.")
        return

    nieuw = 0
    for raw_id, sup_id, cents, vanaf, bron in rijen:
        # Niet dubbel schrijven: dezelfde prijs op dezelfde ingangsdatum uit
        # deze bron is geen nieuwe prijs.
        cur.execute("""
            select 1 from ingredient_prices
            where raw_ingredient_id = %s and source like %s
              and price_cents = %s and effective_date = %s limit 1
        """, (raw_id, BRON + "%", cents, vanaf))
        if cur.fetchone():
            continue
        cur.execute("""
            insert into ingredient_prices
              (raw_ingredient_id, supplier_id, price_cents, price_includes_vat,
               effective_date, source, created_by)
            values (%s,%s,%s,false,%s,%s,'sync-van-gelder-prices')
        """, (raw_id, sup_id, cents, vanaf, bron))
        nieuw += 1
    conn.commit()
    conn.close()
    print(f"\n{nieuw} nieuwe prijsregels weggeschreven (van {len(rijen)} gematcht; "
          "de rest stond er al met dezelfde prijs en ingangsdatum).")


if __name__ == "__main__":
    main()
