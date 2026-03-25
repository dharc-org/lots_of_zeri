"""
ZAC — browse.py
Generic config-driven router for all browse tabs (eventi_asta, cataloghi, …).
Reads facets.yaml to know which facets exist, which query params to accept,
and how to render results. No per-tab hardcoding.

Results are loaded 50 at a time: first page SSR, subsequent batches via
GET /api{path}/results?offset=50&limit=50&...filters... → JSON.
"""
import asyncio
import logging

from fastapi import APIRouter, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from backend.services.sparql import FilterEngine

log    = logging.getLogger("zac.browse")
router = APIRouter()
tmpl: Jinja2Templates = None

PAGE_SIZE = 50          # results per batch (SSR + infinite scroll)


def setup(t: Jinja2Templates):
    global tmpl
    tmpl = t


# ── Helpers ──────────────────────────────────────────────────

def _inject_filters(query_body: str, filter_block: str) -> str:
    """Inject a SPARQL filter block before the last closing brace (before GROUP BY if present)."""
    if not filter_block.strip():
        return query_body
    indent = "\n        "
    block  = indent + filter_block.strip().replace("\n", indent)

    upper     = query_body.upper()
    group_idx = upper.rfind("GROUP BY")
    if group_idx != -1:
        before = query_body[:group_idx]
        brace  = before.rfind("}")
        if brace != -1:
            return before[:brace] + block + "\n    " + before[brace:] + query_body[group_idx:]
    brace = query_body.rfind("}")
    if brace != -1:
        return query_body[:brace] + block + "\n    " + query_body[brace:]
    return query_body


def _build_engine(cfg, tab_id: str, params: dict, *, skip_facet: str = None) -> FilterEngine:
    """Build a FilterEngine from active filter params, optionally skipping one facet (cross-filtering)."""
    facets = cfg.get_facets_for_tab(tab_id)
    engine = FilterEngine(cfg, tab_id)

    for fid, fcfg in facets.items():
        if fid == skip_facet:
            continue
        ftype = fcfg.get("type", "multiselect")

        if ftype == "range":
            yf = params.get(fid + "_from")
            yt = params.get(fid + "_to")
            if yf or yt:
                engine.apply(fid, year_from=yf, year_to=yt)

        elif ftype == "multiselect":
            vals = params.get(fid)
            if vals:
                engine.apply(fid, values=vals)

        elif ftype == "text_search":
            txt = params.get(fid)
            if txt:
                engine.apply(fid, text=txt)

        elif ftype == "boolean":
            val = params.get(fid)
            if val in ("true", "false"):
                engine.apply(fid, boolean=(val == "true"))

    return engine


async def _facet_values(sparql, cfg, tab_id: str, facet_id: str,
                        filter_block: str = "") -> list:
    key  = f"{tab_id}__{facet_id}"
    body = cfg.get_facet_query_by_key(key)
    if not body:
        return []
    
    if "{FILTERS}" in body:
        body = body.replace("{FILTERS}", filter_block.strip())
    elif filter_block.strip():
        body = _inject_filters(body, filter_block)
    
    full_query = cfg.get_prefixes() + body
    
    try:
        rows = await sparql.select(full_query)
        rows = await sparql.select(cfg.get_prefixes() + body)
        return [
            {
                "uri":   r["facetURI"],     # URI (valore)
                "value": r["facetValue"],   # label solo per display
                "count": int(float(r.get("count", 0)))
            }
            for r in rows if r.get("facetValue") not in (None, "", "NaN")
        ]
    except Exception as e:
        log.warning(f"Facet {tab_id}/{facet_id}: {e}")
        return []


def _parse_params(request: Request, facets: dict) -> dict:
    """Extract all facet filter params from the query string, based on backend/config/facets.yaml config.
    Made to avoid a route for each tab, this general script creates it for each route. 
    
    INPUT: Input: HTTP request and facets definition in config (facets.yaml).

    Example HTTP request: cataloghi?anno_pubblicazione_from=1890&anno_pubblicazione_to=1920&lingua=Francese&lingua=Tedesco&titolo=Sotheby
    
    Example config: 
        eventi_asta:
            organizzatore:
                label_it: "Organizzatori"
                label_en: "Organisers"
                type: "multiselect"
                ui_widget: "checkbox_list"

    Available facet types: multiselect (default), range, text_search, boolean

    OUTPUT: Dictionary of selected values (from HTTP request) on facets configuration
    Example output:
        params = {
            "anno_pubblicazione_from": 1890,      # int, non stringa
            "anno_pubblicazione_to":   1920,      # int, non stringa
            "lingua":                  ["Francese", "Tedesco"],  # lista
            "titolo":                  "Sotheby"  # stringa
        }
    """
    query_params     = request.query_params
    params = {}

    for facet_id, facet_config in facets.items():
        facet_type = facet_config.get("type", "multiselect") # if no key then multiselect as default

        if facet_type == "range":
            value_from = query_params.get(facet_id + "_from")
            value_to = query_params.get(facet_id + "_to")
            if value_from:
                try: params[facet_id + "_from"] = int(value_from)
                except ValueError: pass
            if value_to:
                try: params[facet_id + "_to"] = int(value_to)
                except ValueError: pass

        elif facet_type == "multiselect":
            vals = query_params.getlist(facet_id)
            if vals:
                params[facet_id] = vals

        elif facet_type == "text_search":
            val = query_params.get(facet_id)
            if val:
                params[facet_id] = val

        elif facet_type == "boolean":
            val = query_params.get(facet_id)
            if val in ("true", "false"):
                params[facet_id] = val

    return params


def _build_facet_defs(facets: dict, facet_values: dict, params: dict, dynamic_ranges=None) -> list:
    defs = []
    for fid, fcfg in facets.items():
        ftype = fcfg.get("type", "multiselect")
        d = {
            "id":        fid,
            "label_it":  fcfg.get("label_it", fid),
            "type":      ftype,
            "ui_widget": fcfg.get("ui_widget", "checkbox_list"),
            "options":   [],
            "range":     dynamic_ranges[fid] if (dynamic_ranges and fid in dynamic_ranges) else fcfg.get("range", {}),
        }

        if ftype == "multiselect":
            d["options"] = facet_values.get(fid, [])
        elif ftype == "boolean":
            yaml_vals = fcfg.get("values", {"true": "Sì", "false": "No"})
            counts = {item["value"]: item["count"] for item in facet_values.get(fid, [])}
            d["options"] = [{"value": k, "label": v, "count": counts.get(k, 0)} for k, v in yaml_vals.items()]

        defs.append(d)
    return defs


def _extract_items(rows: list, route_cfg: dict) -> list:
    """Deduplicate SPARQL result rows and map to item dicts using route.result_fields config."""
    uri_var = route_cfg.get("uri_var", "uri")
    field_map = route_cfg.get("result_fields", {})
    slug_from_uri = route_cfg.get("slug_from_uri", False)
    slug_var      = route_cfg.get("slug_var")

    seen, items = set(), []
    for r in rows:
        u = r.get(uri_var, "")
        if u in seen:
            continue
        seen.add(u)
        item = {"uri": u}
        for local_name, sparql_var in field_map.items():
            item[local_name] = r.get(sparql_var)
        if slug_var:
            item["slug"] = r.get(slug_var) or u.rstrip("/").split("/")[-1]
        elif slug_from_uri:
            item["slug"] = u.rstrip("/").split("/")[-1]
        if not item.get("title") and not item.get("label"):
            item["label"] = item.get("doc_id") or item.get("slug") or u
        items.append(item)
    return items


async def _run_results_query(sparql, cfg, tab_id, route_cfg, facets, params, limit, offset):
    """Execute the count + data queries and return (total, items)."""
    engine = _build_engine(cfg, tab_id, params)
    pfx    = cfg.get_prefixes()
    count_q = pfx + engine.build_query(cfg.get_results_query(route_cfg["count_query"]), 0, 0)
    data_q  = pfx + engine.build_query(cfg.get_results_query(route_cfg["results_query"]), limit, offset)

    count_res, data_res = await asyncio.gather(
        sparql.select(count_q),
        sparql.select(data_q),
        return_exceptions=True,
    )
    if isinstance(count_res, Exception):
        log.error(f"Count: {count_res}"); count_res = [{}]
    if isinstance(data_res, Exception):
        log.error(f"Data: {data_res}"); data_res = []

    total = int(float((count_res or [{}])[0].get("total", 0)))
    items = _extract_items(data_res, route_cfg)
    return total, items

async def _facet_range(sparql, cfg, tab_id, facet_id, filter_block=""):
    key  = f"{tab_id}__{facet_id}__range"
    body = cfg.get_facet_query_by_key(key)
    if not body:
        return None
    body = body.replace("{FILTERS}", filter_block.strip())
    rows = await sparql.select(cfg.get_prefixes() + body)
    if rows:
        return {"min": int(float(rows[0].get("minYear", 1860))),
                "max": int(float(rows[0].get("maxYear", 1940)))}
    return None

# ── Register routes for each enabled tab ──────────────────────
def register_tab_routes(cfg):
    """Called at startup: creates routes for each enabled tab declared in backend/config/facets.yaml config file.
        
        Example configuration:
        eventi_asta:
          route:
            path: "/aste"
            active_tab: "aste"
            template: "eventi.html"
            detail_template: "evento_detail.html
    
    """
    facets_cfg = cfg._facets

    for tab_id, tab_cfg in facets_cfg.items():
        if tab_id in ("namespaces", "ui"):
            continue
        if not tab_cfg.get("enabled", True):
            continue
        route_cfg = tab_cfg.get("route")
        if not route_cfg:
            continue

        _register_list_route(tab_id, tab_cfg, route_cfg, cfg)  # example GET /cataloghi, GET /aste
        _register_api_route(tab_id, tab_cfg, route_cfg, cfg)
        _register_detail_route(tab_id, tab_cfg, route_cfg, cfg)


def _register_list_route(tab_id, tab_cfg, route_cfg, cfg):
    """Register an SSR route for a tab.
    Loads first PAGE_SIZE results and all facets."""
    
    path   = route_cfg["path"] # route name (e.g., /aste)
    facets = tab_cfg.get("facets", {}) # all facets definitions from config

    @router.get(path, response_class=HTMLResponse)
    async def tab_list(request: Request):
        sparql = request.app.state.sparql
        cfg    = request.app.state.config
        params = _parse_params(request, facets)
        log.warning(f"PARAMS: {params}")


        # ── 1. Tutti i facet + count + dati in parallelo ──────────
        all_facets = list(facets.keys())

        engine  = _build_engine(cfg, tab_id, params)
        pfx     = cfg.get_prefixes()
        count_q = pfx + engine.build_query(cfg.get_results_query(route_cfg["count_query"]), 0, 0)
        data_q  = pfx + engine.build_query(cfg.get_results_query(route_cfg["results_query"]), PAGE_SIZE, 0)
        
        facet_tasks = [
            _facet_values(sparql, cfg, tab_id, facet_id,
                        _build_engine(cfg, tab_id, params, skip_facet=facet_id).build())
            for facet_id in all_facets
        ]

        all_tasks = facet_tasks + [sparql.select(count_q), sparql.select(data_q)]
        results   = await asyncio.gather(*all_tasks, return_exceptions=True)

        # ── 2. Unpack ─────────────────────────────────────────────
        facet_values = {}
        for i, facet_id in enumerate(all_facets):
            val = results[i]
            facet_values[facet_id] = val if not isinstance(val, Exception) else []
            if isinstance(val, Exception):
                log.error(f"Facet {facet_id}: {val}")

        # ── 2b. Range dinamici per slider ────────────────────────────────
        dynamic_ranges = {}
        for fid, fcfg in facets.items():
            if fcfg.get("type") != "range":
                continue
            range_filter = _build_engine(cfg, tab_id, params, skip_facet=fid).build()
            rng = await _facet_range(sparql, cfg, tab_id, fid, range_filter)
            if rng:
                dynamic_ranges[fid] = rng

        count_res = results[len(all_facets)]
        data_res  = results[len(all_facets) + 1]
        if isinstance(count_res, Exception):
            log.error(f"Count: {count_res}"); count_res = [{}]
        if isinstance(data_res, Exception):
            log.error(f"Data: {data_res}"); data_res = []

        total = int(float((count_res or [{}])[0].get("total", 0)))
        items = _extract_items(data_res, route_cfg)

        # ── 3. active_filters per sidebar ────────────────────────
        active_filters = {}
        for fid, fcfg in facets.items():
            ftype = fcfg.get("type")
            if ftype == "range":
                rng = fcfg.get("range", {})
                active_filters[fid + "_from"] = params.get(fid + "_from") or rng.get("min", 1860)
                active_filters[fid + "_to"]   = params.get(fid + "_to")   or rng.get("max", 1940)
            elif ftype == "multiselect":
                active_filters[fid] = params.get(fid, [])
            elif ftype == "text_search":
                active_filters[fid] = params.get(fid, "")
            elif ftype == "boolean":
                active_filters[fid] = params.get(fid, "")

        facet_defs = _build_facet_defs(facets, facet_values, params, dynamic_ranges)
        log.warning(f"ACTIVE_FILTERS: {active_filters}")
        return tmpl.TemplateResponse("browse.html", {
            "request":        request,
            "active_tab":     route_cfg.get("active_tab", tab_id),
            "tab_route":      route_cfg["path"],
            "tab_label":      tab_cfg.get("label_it", tab_id),
            "icon":           route_cfg.get("icon", "bi-search"),
            "entity_label":   route_cfg.get("entity_label", "risultati"),
            "facet_defs":     facet_defs,
            "active_filters": active_filters,
            "items":          items,
            "total":          total,
            "loaded":         len(items),
            "page_size":      PAGE_SIZE,
        })


def _register_api_route(tab_id, tab_cfg, route_cfg, cfg):
    """JSON API: returns next batch of results for infinite scroll."""
    api_path = "/api" + route_cfg["path"] + "/results"
    facets   = tab_cfg.get("facets", {})

    @router.get(api_path)
    async def tab_api_results(request: Request,
                              offset: int = Query(0, ge=0),
                              limit:  int = Query(PAGE_SIZE, ge=1, le=100),
                              _tab_id=tab_id, _route_cfg=route_cfg, _facets=facets):
        sparql = request.app.state.sparql
        cfg    = request.app.state.config
        params = _parse_params(request, _facets)

        engine = _build_engine(cfg, _tab_id, params)
        pfx    = cfg.get_prefixes()
        data_q = pfx + engine.build_query(
            cfg.get_results_query(_route_cfg["results_query"]), limit, offset
        )

        try:
            data_res = await sparql.select(data_q)
        except Exception as e:
            log.error(f"API results: {e}")
            data_res = []

        items = _extract_items(data_res, _route_cfg)
        return JSONResponse(content={
            "items":    items,
            "offset":   offset,
            "limit":    limit,
            "returned": len(items),
        })


def _register_detail_route(tab_id, tab_cfg, route_cfg, cfg):
    path            = route_cfg["path"] + "/{slug}"
    detail_query    = route_cfg.get("detail_query")
    detail_template = route_cfg.get("detail_template")
    if not detail_query or not detail_template:
        return

    @router.get(path, response_class=HTMLResponse)
    async def tab_detail(request: Request, slug: str,
                         _tab_id=tab_id, _route_cfg=route_cfg,
                         _detail_query=detail_query, _detail_template=detail_template):
        cfg    = request.app.state.config
        sparql = request.app.state.sparql
        uri    = f"http://w3id.org/zac/{slug}"

        q    = cfg.get_prefixes() + cfg.get_detail_query(_detail_query).replace("{uri}", uri)
        rows = []
        try:
            rows = await sparql.select(q)
        except Exception as e:
            log.error(e)

        if not rows:
            return tmpl.TemplateResponse("404.html", {"request": request}, status_code=404)

        def uniq(key):
            return list({r[key] for r in rows if r.get(key) not in (None, "", "NaN")})

        return tmpl.TemplateResponse(_detail_template, {
            "request":    request,
            "active_tab": _route_cfg.get("active_tab", _tab_id),
            "rows":       rows,
            "r0":         rows[0],
            "uniq":       uniq,
            "uri":        uri,
            "slug":       slug,
        })