"""
ZAC — backend/routers/esplora.py

API dati per la sezione Esplora: sostituisce i JSON statici generati
offline (genera_json_esplora.py) con aggregazioni live dal triplestore.

Pattern:
  GET /api/esplora/{dataset}   (accetta anche "{dataset}.json")

  1. query SPARQL piatta da sparql_queries.yaml (sezione `esplora:`)
  2. shaper Python che riproduce ESATTAMENTE la forma del JSON statico
  3. cache in-memory 24h (i dati cambiano solo a re-index del triplestore)

Il frontend cambia solo DATA_BASE: '/static/data/' → '/api/esplora/'.

Dataset serviti dal triplestore:
  eventi_per_anno, case_dasta, banditori, tipologie_oggetti,
  geografia_decenni, collezioni, trend_mercato
Dataset che restano statici finché non esiste un path paese nel grafo:
  stagionalita, cataloghi_per_paese  (fallback su /static/data/)
"""

import asyncio
import json
import logging
from collections import Counter, defaultdict
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("zac.esplora")

router = APIRouter(prefix="/api/esplora", tags=["esplora"])

# Periodo del corpus digitalizzato: stesse costanti di genera_json_esplora.py
ANNO_MIN, ANNO_MAX = 1879, 1929          # stagionalità / geografia / collezioni
TTL = 86400                               # 24h, come le cover IIIF

# lookup statico città → coordinate (le coordinate non sono nel grafo)
_COORDS_PATH = Path(__file__).resolve().parents[2] / "frontend" / "static" / "data" / "coords_citta.json"
try:
    with open(_COORDS_PATH, encoding="utf-8") as f:
        CITY_COORDS: dict = json.load(f)
except FileNotFoundError:
    logger.warning("coords_citta.json non trovato: trend_mercato senza lat/lon")
    CITY_COORDS = {}


# ─── helper ──────────────────────────────────────────────────

def _int(v, default=0):
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return default


def _has(r, *keys):
    """True se tutte le variabili sono bound nella riga SPARQL.
    QLever omette dal binding le variabili non calcolabili
    (es. YEAR() su una data malformata)."""
    return all(r.get(k) for k in keys)


async def _rows(request: Request, query_name: str):
    cfg    = request.app.state.config
    sparql = request.app.state.sparql
    q = cfg._queries.get("esplora", {}).get(query_name)
    if not q:
        raise HTTPException(500, f"Query esplora '{query_name}' non configurata")
    return await sparql.select(sparql_prefix() + q)


def sparql_prefix() -> str:
    from backend.services.sparql import PREFIXES
    return PREFIXES + "\n"


# ─── shapers ─────────────────────────────────────────────────
# Ogni shaper prende le righe piatte e restituisce il payload
# nella stessa identica forma dei JSON statici.

def _year_span(counts_by_year: dict) -> tuple[int, int]:
    years = [y for y in counts_by_year if y > 0]
    return (min(years), max(years)) if years else (ANNO_MIN, ANNO_MAX)


async def ds_eventi_per_anno(request):
    rows = await _rows(request, "eventi_anno")
    by_year = {_int(r["year"]): _int(r["count"]) for r in rows if _has(r, "year")}
    ymin, ymax = min(by_year), max(by_year)
    return {
        "ymin": ymin,
        "ymax": ymax,
        "ytotals": [by_year.get(y, 0) for y in range(ymin, ymax + 1)],
    }


async def ds_case_dasta(request):
    anno_rows, luogo_rows = await asyncio.gather(
        _rows(request, "case_anno"),
        _rows(request, "case_luogo"),
    )
    py = defaultdict(dict)          # house → {year: count}
    for r in anno_rows:
        if not _has(r, "houseLabel", "year"):
            continue
        py[r["houseLabel"]][_int(r["year"])] = _int(r["count"])

    city_counts = defaultdict(Counter)   # house → Counter(place)
    for r in luogo_rows:
        if _has(r, "houseLabel", "placeLabel"):
            city_counts[r["houseLabel"]][r["placeLabel"]] += _int(r["count"])

    all_years = [y for d in py.values() for y in d]
    ymin, ymax = (min(all_years), max(all_years)) if all_years else (ANNO_MIN, ANNO_MAX)

    houses = []
    for name, years in py.items():
        tot = sum(years.values())
        city = city_counts[name].most_common(1)[0][0] if city_counts[name] else ""
        houses.append({
            "n": name,
            "t": tot,
            "y0": min(years),
            "y1": max(years),
            "city": city,
            "py": {str(y): c for y, c in sorted(years.items())},
        })
    houses.sort(key=lambda h: (-h["t"], h["n"]))
    return {"ymin": ymin, "ymax": ymax, "houses": houses}


async def ds_banditori(request):
    rows = await _rows(request, "banditori_case")
    totals = Counter()                    # banditore → n eventi
    edges_c = Counter()                   # (banditore, casa) → n eventi
    for r in rows:
        if not _has(r, "bandLabel"):
            continue
        band = r["bandLabel"]
        cnt  = _int(r["count"])
        totals[band] += cnt
        house = r.get("houseLabel")
        if house:
            edges_c[(band, house)] += cnt

    rel_bands = {b for (b, _h) in edges_c}
    all_items = [
        {
            "n": b, "t": t,
            "rel": b in rel_bands,
            "status": "relazionato" if b in rel_bands else "autorganizzato",
        }
        for b, t in totals.items()
    ]
    all_items.sort(key=lambda x: (-x["t"], x["n"]))

    top_band = [{"n": x["n"], "t": x["t"]} for x in all_items if x["rel"]]
    band_idx = {x["n"]: i for i, x in enumerate(top_band)}

    case = sorted({h for (_b, h) in edges_c},
                  key=lambda h: -sum(v for (b2, h2), v in edges_c.items() if h2 == h))
    case_idx = {h: i for i, h in enumerate(case)}

    edges = sorted(
        [[band_idx[b], case_idx[h], v] for (b, h), v in edges_c.items()],
        key=lambda e: (e[0], -e[2]),
    )
    return {"all": all_items, "top_band": top_band, "case": case, "edges": edges}


# categorie principali fisse, tutto il resto → ALTRE (come nel JSON attuale)
_TIPO_MAIN = ["DIPINTI", "MOBILI", "DISEGNI", "ACQUERELLI", "PORCELLANE", "STAMPE"]

async def ds_tipologie_oggetti(request):
    rows = await _rows(request, "tipologie_anno")
    by = defaultdict(Counter)             # tipo (UPPER) → {year: count}
    for r in rows:
        if not _has(r, "tipoLabel", "year"):
            continue
        by[r["tipoLabel"].strip().upper()][_int(r["year"])] += _int(r["count"])

    all_years = [y for c in by.values() for y in c]
    ymin, ymax = (min(all_years), max(all_years)) if all_years else (ANNO_MIN, ANNO_MAX)

    cats = _TIPO_MAIN + ["ALTRE"]
    m, tot = [], {c: 0 for c in cats}
    altre_tot = Counter()
    for y in range(ymin, ymax + 1):
        row = []
        for c in _TIPO_MAIN:
            v = by.get(c, {}).get(y, 0)
            row.append(v)
            tot[c] += v
        altre_y = 0
        for tipo, counts in by.items():
            if tipo not in _TIPO_MAIN:
                v = counts.get(y, 0)
                altre_y += v
                if v:
                    altre_tot[tipo] += v
        row.append(altre_y)
        tot["ALTRE"] += altre_y
        m.append(row)

    return {
        "ymin": ymin, "ymax": ymax,
        "cats": cats, "tot": tot, "m": m,
        "altre_voci": [[n, v] for n, v in altre_tot.most_common()],
    }


def _decade_bucket(year: int) -> int:
    if ANNO_MIN <= year <= 1889:
        return 1879
    return (year // 10) * 10

_DECADI = [(1879, "1879–89"), (1890, "1890–99"), (1900, "1900–09"),
           (1910, "1910–19"), (1920, "1920–29")]

async def ds_geografia_decenni(request):
    rows = await _rows(request, "luoghi_anno")
    per_dec = defaultdict(Counter)        # decade → Counter(place)
    for r in rows:
        if not _has(r, "placeLabel", "year"):
            continue
        y = _int(r["year"])
        if ANNO_MIN <= y <= ANNO_MAX:
            per_dec[_decade_bucket(y)][r["placeLabel"]] += _int(r["count"])

    decades_out = []
    for dec, label in _DECADI:
        vc = per_dec.get(dec, Counter()).most_common()
        top, resto = vc[:10], vc[10:]
        tot = sum(v for _n, v in vc)
        decades_out.append({
            "label": label,
            "tot": tot,
            "top":   [{"n": n, "v": v} for n, v in top],
            "altre": tot - sum(v for _n, v in top),
            "resto": [{"n": n, "v": v} for n, v in resto],
        })
    scale_max = max((t["v"] for d in decades_out for t in d["top"]), default=0)
    return {"period": f"{ANNO_MIN}–{ANNO_MAX}", "scale_max": scale_max,
            "decades": decades_out}


def _classifica_tag(years, houses_counter):
    n_years  = len(set(years))
    n_houses = len([k for k in houses_counter if k != "non specificata"])
    if n_years == 1:
        return "anno"
    if n_houses <= 1:
        return "casa"
    return "diverse"


async def ds_collezioni(request):
    rows = await _rows(request, "collezioni_eventi")
    # per (collezione) → lista di (year, house); dedup per evento
    per_coll = defaultdict(list)
    seen = set()
    for r in rows:
        if not _has(r, "collLabel", "year"):
            continue
        y = _int(r["year"])
        if not (ANNO_MIN <= y <= ANNO_MAX):
            continue
        key = (r["collLabel"], r["auction"])
        if key in seen:
            continue
        seen.add(key)
        per_coll[r["collLabel"]].append((y, r.get("houseLabel") or "non specificata"))

    totale     = len(per_coll)
    ricorrenti = sum(1 for v in per_coll.values() if len(v) >= 2)
    singole    = totale - ricorrenti
    pct        = round(ricorrenti / totale * 100) if totale else 0

    items = []
    for name, occ in per_coll.items():
        if len(occ) < 2:
            continue
        years = sorted(y for y, _h in occ)
        oc = Counter(h for _y, h in occ)
        y0, y1 = years[0], years[-1]
        items.append({
            "n": name.replace("COLLEZIONE ", "").title(),
            "c": len(occ),
            "tag": _classifica_tag(years, oc),
            "anni": [y0, y1],
            "periodo": f"{y0}" if y0 == y1 else f"{y0}–{y1}",
            "case": [{"n": k, "v": v}
                     for k, v in sorted(oc.items(), key=lambda kv: -kv[1])],
        })
    items.sort(key=lambda it: (-it["c"], it["n"]))

    return {
        "stats": {"totale": totale, "ricorrenti": ricorrenti,
                  "pct_ricorrenti": pct, "singole": singole},
        "max": max((it["c"] for it in items), default=0),
        "tag_labels": {"anno": "stesso anno", "casa": "stessa casa",
                       "diverse": "case diverse"},
        "items": items,
    }


async def ds_trend_mercato(request):
    anno_rows, luoghi_rows, case_rows = await asyncio.gather(
        _rows(request, "eventi_anno"),
        _rows(request, "luoghi_anno"),
        _rows(request, "luoghi_case"),
    )
    by_year = {_int(r["year"]): _int(r["count"]) for r in anno_rows if _has(r, "year")}
    ymin, ymax = min(by_year), max(by_year)

    city_py = defaultdict(dict)           # città → {year: count}
    for r in luoghi_rows:
        if not _has(r, "placeLabel", "year"):
            continue
        city_py[r["placeLabel"]][_int(r["year"])] = _int(r["count"])

    city_org = defaultdict(Counter)       # città → Counter(casa)
    for r in case_rows:
        if not _has(r, "placeLabel", "houseLabel"):
            continue
        city_org[r["placeLabel"]][r["houseLabel"]] += _int(r["count"])

    tot_eventi = sum(by_year.values())
    cities, mapped_events = [], 0
    for name, years in city_py.items():
        coords = CITY_COORDS.get(name)
        if not coords:
            continue                       # città senza coordinate → "others"
        t = sum(years.values())
        mapped_events += t
        org = city_org[name].most_common(1)[0][0] if city_org[name] else ""
        cities.append({
            "n": name, "lat": coords["lat"], "lon": coords["lon"],
            "t": t, "y0": min(years), "y1": max(years), "org": org,
            "py": {str(y): c for y, c in sorted(years.items())},
        })
    cities.sort(key=lambda c: (-c["t"], c["n"]))

    return {
        "ymin": ymin, "ymax": ymax,
        "ytotals": [by_year.get(y, 0) for y in range(ymin, ymax + 1)],
        "cities": cities,
        "others": tot_eventi - mapped_events,
        "tot": tot_eventi,
    }


# ─── registry + route generica ───────────────────────────────

DATASETS = {
    "eventi_per_anno":   ds_eventi_per_anno,
    "case_dasta":        ds_case_dasta,
    "banditori":         ds_banditori,
    "tipologie_oggetti": ds_tipologie_oggetti,
    "geografia_decenni": ds_geografia_decenni,
    "collezioni":        ds_collezioni,
    "trend_mercato":     ds_trend_mercato,
}

# finché non c'è un path paese nel grafo, questi restano file statici
STATIC_FALLBACK = {"stagionalita", "cataloghi_per_paese"}
_STATIC_DIR = Path(__file__).resolve().parents[2] / "frontend" / "static" / "data"


@router.get("/{dataset}")
async def esplora_dataset(dataset: str, request: Request):
    name = dataset.removesuffix(".json")

    if name in STATIC_FALLBACK:
        path = _STATIC_DIR / f"{name}.json"
        if not path.exists():
            raise HTTPException(404, f"Dataset statico '{name}' non trovato")
        with open(path, encoding="utf-8") as f:
            return JSONResponse(json.load(f))

    shaper = DATASETS.get(name)
    if not shaper:
        raise HTTPException(404, f"Dataset '{name}' sconosciuto")

    cache = request.app.state.cache
    cached = cache.get_or_none("esplora", {"ds": name})
    if cached is not None:
        return JSONResponse(cached)

    payload = await shaper(request)
    cache.set(cache._make_key("esplora", {"ds": name}), payload, ttl=TTL)
    return JSONResponse(payload)