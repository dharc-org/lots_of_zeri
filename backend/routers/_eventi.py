"""
ZAC — router eventi.py
Tutto server-side: riceve i parametri GET dal form, interroga il triplestore,
passa i dati al template Jinja2. Zero JSON, zero fetch().
"""
import math
import logging
from typing import List, Optional

from fastapi import APIRouter, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from backend.services.sparql import FilterEngine

log    = logging.getLogger("zac.eventi")
router = APIRouter()
tmpl: Jinja2Templates = None          # iniettato da main.py


def setup(t: Jinja2Templates):
    global tmpl
    tmpl = t


# ── helper: carica i valori distinti per ogni facet checkbox ──────────────────
async def _facet_values(sparql, config, facet_id: str) -> list:
    key  = f"eventi_asta__{facet_id}"
    body = config.get_facet_query_by_key(key)
    if not body:
        return []
    try:
        rows = await sparql.select(config.get_prefixes() + body)
        return [
            {"value": r["facetValue"], "count": int(float(r.get("count", 0)))}
            for r in rows if r.get("facetValue") not in (None, "", "NaN")
        ]
    except Exception as e:
        log.warning(f"Facet {facet_id}: {e}")
        return []


# ── LIST ──────────────────────────────────────────────────────────────────────
@router.get("/eventi", response_class=HTMLResponse)
async def eventi_list(
    request:            Request,
    year_from:          Optional[int]       = Query(None),
    year_to:            Optional[int]       = Query(None),
    organizzatore:      Optional[List[str]] = Query(None),
    banditore:          Optional[List[str]] = Query(None),
    tipologia_oggetti:  Optional[List[str]] = Query(None),
    cronologia_oggetti: Optional[List[str]] = Query(None),
    luogo:              Optional[List[str]] = Query(None),
    page:               int                 = Query(1, ge=1),
    page_size:          int                 = Query(20, ge=1, le=100),
):
    cfg    = request.app.state.config
    sparql = request.app.state.sparql

    # ── 1. Carica valori facet (per popolare le checkbox) ─────────────────────
    facet_values = {
        "organizzatore":      await _facet_values(sparql, cfg, "organizzatore"),
        "banditore":          await _facet_values(sparql, cfg, "banditore"),
        "tipologia_oggetti":  await _facet_values(sparql, cfg, "tipologia_oggetti"),
        "cronologia_oggetti": await _facet_values(sparql, cfg, "cronologia_oggetti"),
        "luogo":              await _facet_values(sparql, cfg, "luogo"),
    }

    # ── 2. Costruisce filtri SPARQL ────────────────────────────────────────────
    engine = FilterEngine(cfg, "eventi_asta")
    if year_from or year_to:
        engine.apply("periodo",             year_from=year_from, year_to=year_to)
    if organizzatore:
        engine.apply("organizzatore",       values=organizzatore)
    if banditore:
        engine.apply("banditore",           values=banditore)
    if tipologia_oggetti:
        engine.apply("tipologia_oggetti",   values=tipologia_oggetti)
    if cronologia_oggetti:
        engine.apply("cronologia_oggetti",  values=cronologia_oggetti)
    if luogo:
        engine.apply("luogo",               values=luogo)

    # ── 3. Esegue query ────────────────────────────────────────────────────────
    pfx        = cfg.get_prefixes()
    offset     = (page - 1) * page_size
    count_q    = pfx + engine.build_query(cfg.get_results_query("eventi_asta_count"), 0, 0)
    data_q     = pfx + engine.build_query(cfg.get_results_query("eventi_asta"), page_size, offset)

    try:
        total  = int(float((await sparql.select(count_q) or [{}])[0].get("total", 0)))
        rows   = await sparql.select(data_q)
    except Exception as e:
        log.error(e); total, rows = 0, []

    seen, items = set(), []
    for r in rows:
        u = r.get("auction", "")
        if u in seen: continue
        seen.add(u)
        items.append({
            "uri":    u,
            "slug":   u.rstrip("/").split("/")[-1],
            "label":  r.get("auctionLabel") or u,
            "house":  r.get("houseLabel"),
            "year":   r.get("yearLabel"),
            "place":  r.get("placeLabel"),
        })

    # ── 4. Renderizza template ────────────────────────────────────────────────
    return tmpl.TemplateResponse("eventi.html", {
        "request":      request,
        "active_tab":   "eventi",
        # dati facet
        "facet_values": facet_values,
        "year_min": 1860, "year_max": 1940,
        # filtri attivi (per pre-selezionare i widget)
        "f_year_from":          year_from,
        "f_year_to":            year_to,
        "f_organizzatore":      organizzatore or [],
        "f_banditore":          banditore or [],
        "f_tipologia_oggetti":  tipologia_oggetti or [],
        "f_cronologia_oggetti": cronologia_oggetti or [],
        "f_luogo":              luogo or [],
        # risultati
        "items":       items,
        "total":       total,
        "page":        page,
        "page_size":   page_size,
        "total_pages": math.ceil(total / page_size) if page_size else 1,
    })


# ── DETAIL ────────────────────────────────────────────────────────────────────
@router.get("/eventi/{slug}", response_class=HTMLResponse)
async def evento_detail(request: Request, slug: str):
    cfg    = request.app.state.config
    sparql = request.app.state.sparql
    uri    = f"http://w3id.org/zac/{slug}"

    q    = cfg.get_prefixes() + cfg.get_detail_query("evento_item").replace("{uri}", uri)
    rows = []
    try:
        rows = await sparql.select(q)
    except Exception as e:
        log.error(e)

    if not rows:
        return tmpl.TemplateResponse("404.html", {"request": request}, status_code=404)

    def uniq(key):
        return list({r[key] for r in rows if r.get(key) not in (None, "", "NaN")})

    return tmpl.TemplateResponse("evento_detail.html", {
        "request":    request,
        "active_tab": "eventi",
        "item": {
            "uri":          uri,
            "slug":         slug,
            "label":        rows[0].get("label"),
            "house":        rows[0].get("houseLabel"),
            "time_span":    rows[0].get("timeLabel"),
            "place":        rows[0].get("placeLabel"),
            "object_types": uniq("typeLabel"),
            "doc_id":       rows[0].get("docId"),
        },
    })
