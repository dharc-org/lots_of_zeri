"""
ZAC — router catalogo.py
Facet counts context-aware (cross-filtering).
"""
import math
import logging
from typing import List, Optional

from fastapi import APIRouter, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from sparql import FilterEngine

log    = logging.getLogger("zac.catalogo")
router = APIRouter()
tmpl: Jinja2Templates = None


def setup(t: Jinja2Templates):
    global tmpl
    tmpl = t


def _build_engine(cfg, *, year_from, year_to, titolo, lingua, illustrazioni,
                  autori, coautori, skip_facet: str = None) -> FilterEngine:
    engine = FilterEngine(cfg, "catalogo")
    if skip_facet != "periodo_asta" and (year_from or year_to):
        engine.apply("periodo_asta",  year_from=year_from, year_to=year_to)
    if skip_facet != "titolo" and titolo:
        engine.apply("titolo",        text=titolo)
    if skip_facet != "lingua" and lingua:
        engine.apply("lingua",        values=lingua)
    if skip_facet != "illustrazioni" and illustrazioni in ("true", "false"):
        engine.apply("illustrazioni", boolean=(illustrazioni == "true"))
    if skip_facet != "autori" and autori:
        engine.apply("autori",        values=autori)
    if skip_facet != "coautori" and coautori:
        engine.apply("coautori",      values=coautori)
    return engine


def _inject_filters(query_body: str, filter_block: str, facet_id: str = "") -> str:
    """
    Inserisce filter_block dentro il WHERE della facet query, prima della
    chiusura finale (l'ultima } prima di GROUP BY).
    """
    if not filter_block.strip():
        return query_body

    upper = query_body.upper()
    group_idx = upper.rfind("GROUP BY")

    if group_idx != -1:
        before_group = query_body[:group_idx]
        # Trova l'ultima } prima di GROUP BY = chiusura del WHERE
        last_brace = before_group.rfind("}")
        if last_brace != -1:
            injected = (
                before_group[:last_brace]
                + "\n        # context filter\n        "
                + filter_block.strip().replace("\n", "\n        ")
                + "\n    "
                + before_group[last_brace:]  # la } di chiusura WHERE
                + query_body[group_idx:]     # GROUP BY ...
            )
            log.warning(f"[FACET {facet_id}] Query con filtro iniettato:\n{injected}")
            return injected

    # fallback: prima dell'ultima }
    last_brace = query_body.rfind("}")
    if last_brace != -1:
        injected = (
            query_body[:last_brace]
            + "\n        "
            + filter_block.strip().replace("\n", "\n        ")
            + "\n    "
            + query_body[last_brace:]
        )
        log.warning(f"[FACET {facet_id}] Query fallback:\n{injected}")
        return injected

    return query_body


async def _facet_values(sparql, cfg, facet_id: str, filter_block: str = "") -> list:
    key  = f"catalogo__{facet_id}"
    body = cfg.get_facet_query_by_key(key)
    if not body:
        return []
    if filter_block:
        body = _inject_filters(body, filter_block, facet_id)
    try:
        rows = await sparql.select(cfg.get_prefixes() + body)
        return [
            {"value": r["facetValue"], "count": int(float(r.get("count", 0)))}
            for r in rows if r.get("facetValue") not in (None, "", "NaN")
        ]
    except Exception as e:
        log.warning(f"Facet {facet_id} ERRORE: {e}")
        return []


# ── LIST ──────────────────────────────────────────────────────────────────────
@router.get("/catalogo", response_class=HTMLResponse)
async def catalogo_list(
    request:       Request,
    year_from:     Optional[int]       = Query(None),
    year_to:       Optional[int]       = Query(None),
    titolo:        Optional[str]       = Query(None),
    autori:        Optional[List[str]] = Query(None),
    coautori:      Optional[List[str]] = Query(None),
    lingua:        Optional[List[str]] = Query(None),
    illustrazioni: Optional[str]       = Query(None),
    page:          int                 = Query(1, ge=1),
    page_size:     int                 = Query(20, ge=1, le=100),
):
    cfg    = request.app.state.config
    sparql = request.app.state.sparql

    fkw = dict(
        year_from=year_from, year_to=year_to,
        titolo=titolo, lingua=lingua,
        illustrazioni=illustrazioni,
        autori=autori, coautori=coautori,
    )

    # ── 1. Facet counts context-aware ─────────────────────────────────────────
    facet_values = {
        "autori":   await _facet_values(sparql, cfg, "autori",
                        _build_engine(cfg, skip_facet="autori",   **fkw).build()),
        "coautori": await _facet_values(sparql, cfg, "coautori",
                        _build_engine(cfg, skip_facet="coautori", **fkw).build()),
        "lingua":   await _facet_values(sparql, cfg, "lingua",
                        _build_engine(cfg, skip_facet="lingua",   **fkw).build()),
    }

    # ── 2. Engine completo per risultati ──────────────────────────────────────
    engine = _build_engine(cfg, **fkw)

    # ── 3. Query risultati ────────────────────────────────────────────────────
    pfx    = cfg.get_prefixes()
    offset = (page - 1) * page_size
    count_q = pfx + engine.build_query(cfg.get_results_query("catalogo_count"), 0, 0)
    data_q  = pfx + engine.build_query(cfg.get_results_query("catalogo"), page_size, offset)

    try:
        total = int(float((await sparql.select(count_q) or [{}])[0].get("total", 0)))
        rows  = await sparql.select(data_q)
    except Exception as e:
        log.error(e); total, rows = 0, []

    seen, items = set(), []
    for r in rows:
        u = r.get("doc", "")
        if u in seen: continue
        seen.add(u)
        items.append({
            "uri":      u,
            "doc_id":   r.get("docId"),
            "title":    r.get("title") or r.get("docId") or u,
            "year":     r.get("year"),
            "house":    r.get("houseLabel"),
            "language": r.get("langLabel"),
        })

    return tmpl.TemplateResponse("catalogo.html", {
        "request":    request,
        "active_tab": "catalogo",
        "facet_values": facet_values,
        "year_min": 1860, "year_max": 1940,
        "f_year_from":     year_from,
        "f_year_to":       year_to,
        "f_titolo":        titolo or "",
        "f_autori":        autori or [],
        "f_coautori":      coautori or [],
        "f_lingua":        lingua or [],
        "f_illustrazioni": illustrazioni or "",
        "items":       items,
        "total":       total,
        "page":        page,
        "page_size":   page_size,
        "total_pages": math.ceil(total / page_size) if page_size else 1,
    })


# ── DETAIL ────────────────────────────────────────────────────────────────────
@router.get("/catalogo/{doc_id}", response_class=HTMLResponse)
async def catalogo_detail(request: Request, doc_id: str):
    cfg    = request.app.state.config
    sparql = request.app.state.sparql
    uri    = f"http://w3id.org/zac/{doc_id}"

    q    = cfg.get_prefixes() + cfg.get_detail_query("catalogo_item").replace("{uri}", uri)
    rows = []
    try:
        rows = await sparql.select(q)
    except Exception as e:
        log.error(e)

    if not rows:
        return tmpl.TemplateResponse("404.html", {"request": request}, status_code=404)

    def uniq(key):
        return list({r[key] for r in rows if r.get(key) not in (None, "", "NaN")})

    r0 = rows[0]
    return tmpl.TemplateResponse("catalogo_detail.html", {
        "request":    request,
        "active_tab": "catalogo",
        "item": {
            "uri":             uri,
            "doc_id":          r0.get("docId"),
            "title":           r0.get("title"),
            "secondary_title": r0.get("secTitle"),
            "year":            r0.get("year"),
            "house":           r0.get("houseLabel"),
            "languages":       uniq("langLabel"),
            "auction_labels":  uniq("auctionLabel"),
            "collections":     uniq("collLabel"),
            "contributors": [
                {"name": r.get("contribLabel"), "role": r.get("roleLabel")}
                for r in rows if r.get("contribLabel")
            ],
        },
    })