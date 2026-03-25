"""
ZAC — router catalogo.py
Facet counts context-aware (cross-filtering) + query parallele.
"""
import math
import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from backend.services.sparql import FilterEngine

log    = logging.getLogger("zac.catalogo")
router = APIRouter()
tmpl: Jinja2Templates = None


def setup(t: Jinja2Templates):
    global tmpl
    tmpl = t


def _build_engine(cfg, *, year_from, year_to, titolo, lingua, illustrazioni,
                  autori, collezione, skip_facet=None):
    engine = FilterEngine(cfg, "cataloghi")
    if skip_facet != "anno_pubblicazione" and (year_from or year_to):
        engine.apply("anno_pubblicazione", year_from=year_from, year_to=year_to)
    if skip_facet != "titolo" and titolo:
        engine.apply("titolo",        text=titolo)
    if skip_facet != "lingua" and lingua:
        engine.apply("lingua",        values=lingua)
    if skip_facet != "illustrazioni" and illustrazioni in ("true", "false"):
        engine.apply("illustrazioni", boolean=(illustrazioni == "true"))
    if skip_facet != "autori" and autori:
        engine.apply("autori",        values=autori)
    if skip_facet != "collezione" and collezione:
        engine.apply("collezione",        values=collezione)
    return engine


def _inject_filters(query_body, filter_block):
    if not filter_block.strip():
        return query_body
    upper = query_body.upper()
    group_idx = upper.rfind("GROUP BY")
    if group_idx != -1:
        before = query_body[:group_idx]
        brace  = before.rfind("}")
        if brace != -1:
            return (
                before[:brace]
                + "\n        " + filter_block.strip().replace("\n", "\n        ")
                + "\n    " + before[brace:]
                + query_body[group_idx:]
            )
    brace = query_body.rfind("}")
    if brace != -1:
        return (
            query_body[:brace]
            + "\n        " + filter_block.strip().replace("\n", "\n        ")
            + "\n    " + query_body[brace:]
        )
    return query_body


async def _facet_values(sparql, cfg, facet_id, filter_block=""):
    key  = f"cataloghi__{facet_id}"
    body = cfg.get_facet_query_by_key(key)
    if not body:
        return []
    if filter_block:
        body = _inject_filters(body, filter_block)
    try:
        rows = await sparql.select(cfg.get_prefixes() + body)
        return [
            {"value": r["facetValue"], "count": int(float(r.get("count", 0)))}
            for r in rows if r.get("facetValue") not in (None, "", "NaN")
        ]
    except Exception as e:
        log.warning(f"Facet {facet_id}: {e}")
        return []


@router.get("/cataloghi", response_class=HTMLResponse)
async def catalogo_list(
    request:       Request,
    year_from:     Optional[int]       = Query(None),
    year_to:       Optional[int]       = Query(None),
    titolo:        Optional[str]       = Query(None),
    autori:        Optional[List[str]] = Query(None),
    lingua:        Optional[List[str]] = Query(None),
    illustrazioni: Optional[str]       = Query(None),
    collezione:    Optional[List[str]] = Query(None),
    page:          int                 = Query(1, ge=1),
    page_size:     int                 = Query(20, ge=1, le=100),
):
    cfg    = request.app.state.config
    sparql = request.app.state.sparql

    fkw = dict(
        year_from=year_from, year_to=year_to,
        titolo=titolo, lingua=lingua,
        illustrazioni=illustrazioni,
        autori=autori, collezione=collezione
    )

    engine   = _build_engine(cfg, **fkw)
    pfx      = cfg.get_prefixes()
    offset   = (page - 1) * page_size
    count_q  = pfx + engine.build_query(cfg.get_results_query("catalogo_count"), 0, 0)
    data_q   = pfx + engine.build_query(cfg.get_results_query("catalogo"), page_size, offset)
    minmax_q = pfx + _build_engine(cfg, skip_facet="anno_pubblicazione", **fkw).build_query("""
SELECT (MIN(?y) AS ?min) (MAX(?y) AS ?max) WHERE {
    ?doc a crm:E31_Document ;
         crm:P2_has_type aat:300026068 ;
         crm:P94i_was_created_by ?cr .
    ?cr crm:P82_at_some_time_within ?y .
    {FILTERS}
}
""", 0, 0)

    results = await asyncio.gather(
        _facet_values(sparql, cfg, "autori",
                      _build_engine(cfg, skip_facet="autori",  **fkw).build()),
        _facet_values(sparql, cfg, "lingua",
                      _build_engine(cfg, skip_facet="lingua",  **fkw).build()),
        _facet_values(sparql, cfg, "collezione",
                _build_engine(cfg, skip_facet="collezione",  **fkw).build()),
        sparql.select(count_q),
        sparql.select(data_q),
        sparql.select(minmax_q),
        return_exceptions=True,
    )

    autori_vals, lingua_vals, collezione_vals, count_rows, data_rows, minmax_rows = results

    for name, val in [("autori", autori_vals), ("lingua", lingua_vals), ("collezione", collezione_vals),
                      ("count", count_rows), ("data", data_rows), ("minmax", minmax_rows)]:
        if isinstance(val, Exception):
            log.error(f"{name}: {val}")

    autori_vals  = autori_vals  if not isinstance(autori_vals,  Exception) else []
    lingua_vals  = lingua_vals  if not isinstance(lingua_vals,  Exception) else []
    collezione_vals  = collezione_vals  if not isinstance(collezione_vals,  Exception) else []
    count_rows   = count_rows   if not isinstance(count_rows,   Exception) else [{}]
    data_rows    = data_rows    if not isinstance(data_rows,    Exception) else []
    minmax_rows  = minmax_rows  if not isinstance(minmax_rows,  Exception) else [{}]

    total = int(float((count_rows or [{}])[0].get("total", 0)))

    mm = (minmax_rows or [{}])[0]
    range_min = int(mm["min"]) if mm.get("min") else 1860
    range_max = int(mm["max"]) if mm.get("max") else 1940

    disp_year_from = max(year_from, range_min) if year_from else range_min
    disp_year_to   = min(year_to,   range_max) if year_to   else range_max

    seen, items = set(), []
    for r in data_rows:
        u = r.get("doc", "")
        if u in seen:
            continue
        seen.add(u)
        items.append({
            "uri":      u,
            "doc_id":   r.get("docId"),
            "title":    r.get("title") or r.get("docId") or u,
            "year":     r.get("year"),
            "house":    r.get("houseLabel"),
            "language": r.get("langLabel"),
            "collection": r.get("collectionLabel")
        })

    return tmpl.TemplateResponse("catalogo.html", {
        "request":    request,
        "active_tab": "catalogo",
        "facet_values": {
            "autori":  autori_vals,
            "lingua":  lingua_vals,
            "collezione": collezione_vals
        },
        "year_min":        1879,
        "year_max":        1939,
        "f_year_from":     disp_year_from,
        "f_year_to":       disp_year_to,
        "f_titolo":        titolo or "",
        "f_autori":        autori or [],
        "f_lingua":        lingua or [],
        "f_collezioni":    collezione or [], 
        "f_illustrazioni": illustrazioni or "",
        "items":       items,
        "total":       total,
        "page":        page,
        "page_size":   page_size,
        "total_pages": math.ceil(total / page_size) if page_size else 1,
    })


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