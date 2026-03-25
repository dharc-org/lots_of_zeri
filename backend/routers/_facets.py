"""
ZAC Platform — Facets Router
Config-driven: facet definitions come from facets.yaml,
SPARQL queries come from sparql_queries.yaml.
Zero hardcoded queries or filter logic here.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse

router = APIRouter()
logger = logging.getLogger("zac.facets")


@router.get("/facets/{tab}")
async def get_facets(request: Request, tab: str):
    """
    Return all facet definitions + current value lists for a given tab.
    Tabs: eventi_asta | cataloghi | lotti
    """
    config = request.app.state.config
    cache  = request.app.state.cache
    sparql = request.app.state.sparql

    tab_cfg = config.get_tab_config(tab)
    if not tab_cfg:
        return JSONResponse(status_code=404, content={"error": f"Tab '{tab}' not found"})

    if not tab_cfg.get("enabled", True):
        return JSONResponse(content={"tab": tab, "enabled": False, "facets": []})

    cache_key = f"facets:{tab}"
    cached = cache.get_or_none(cache_key, {"tab": tab})
    if cached:
        return JSONResponse(content=cached)

    prefixes = config.get_prefixes()
    result_facets = []

    for facet_id, facet_cfg in tab_cfg.get("facets", {}).items():
        ftype     = facet_cfg.get("type", "multiselect")
        facet_out = {
            "id":        facet_id,
            "label_it":  facet_cfg.get("label_it", facet_id),
            "label_en":  facet_cfg.get("label_en", facet_id),
            "type":      ftype,
            "ui_widget": facet_cfg.get("ui_widget", "checkbox_list"),
        }

        if ftype == "range":
            facet_out["range"] = facet_cfg.get("range", {"min": 1860, "max": 1940, "step": 1})

        elif ftype == "multiselect":
            values = await _fetch_facet_values(sparql, config, tab, facet_id, prefixes)
            facet_out["values"] = values

        elif ftype == "boolean":
            # Values labels come from YAML config
            yaml_values = facet_cfg.get("values", {"true": "Sì", "false": "No"})
            facet_out["values"] = [
                {"value": k, "label": v, "count": 0}
                for k, v in yaml_values.items()
            ]

        # facets.py — nel router get_facets(), blocco ftype == "range"

        elif ftype == "range":
            static_range = facet_cfg.get("range", {"min": 1860, "max": 1940, "step": 1})
            
            # Leggi il range_query dalla config (in sparql_queries.yaml)
            range_query_key = f"{tab}__{facet_id}__range"
            range_query_body = config.get_facet_query_by_key(range_query_key)
            
            if range_query_body:
                try:
                    prefixes = config.get_prefixes()
                    rows = await sparql.select(prefixes + "\n" + range_query_body)
                    if rows and rows[0]:
                        row = rows[0]
                        min_val = row.get("minYear") or row.get("minVal")
                        max_val = row.get("maxYear") or row.get("maxVal")
                        if min_val and max_val:
                            static_range = {
                                "min":  int(float(min_val)),
                                "max":  int(float(max_val)),
                                "step": static_range.get("step", 1),
                            }
                except Exception as e:
                    logger.warning(f"Range query failed for {tab}/{facet_id}: {e}")
                    # fallback ai valori statici YAML — nessun crash
            
            facet_out["range"] = static_range

        elif ftype == "text_search":
            pass  # no pre-fetched values

        result_facets.append(facet_out)

    response = {
        "tab":            tab,
        "enabled":        True,
        "label_it":       tab_cfg.get("label_it", tab),
        "label_en":       tab_cfg.get("label_en", tab),
        "description_it": tab_cfg.get("description_it", ""),
        "facets":         result_facets,
    }

    cache.set_facet(cache_key, {"tab": tab}, response)
    return JSONResponse(content=response)


@router.get("/facets/{tab}/{facet_id}/values")
async def get_facet_values(
    request: Request,
    tab: str,
    facet_id: str,
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """Return filtered values for a specific facet (autocomplete)."""
    config = request.app.state.config
    sparql = request.app.state.sparql

    facet_cfg = config.get_facet(tab, facet_id)
    if not facet_cfg:
        return JSONResponse(status_code=404, content={"error": f"Facet '{facet_id}' not found"})

    prefixes = config.get_prefixes()
    values   = await _fetch_facet_values(sparql, config, tab, facet_id, prefixes, text_filter=q, limit=limit)
    return JSONResponse(content={"values": values, "total": len(values)})


# ─── Internal helper ─────────────────────────────────────────

async def _fetch_facet_values(
    sparql,
    config,
    tab: str,
    facet_id: str,
    prefixes: str,
    text_filter: Optional[str] = None,
    limit: int = 200,
) -> list:
    """
    Fetch distinct facet values from triplestore.
    Query is looked up from sparql_queries.yaml under facet_queries.{tab}__{facet_id}.
    Normalised output: [{value, label, count}]
    """
    query_key  = f"{tab}__{facet_id}"
    query_body = config.get_facet_query_by_key(query_key)

    if not query_body:
        logger.debug(f"No facet_query defined for '{query_key}', skipping")
        return []

    full_query = prefixes + "\n" + query_body

    try:
        rows = await sparql.select(full_query)
    except Exception as exc:
        logger.warning(f"Facet query failed ({query_key}): {exc}")
        return []

    values = []
    for row in rows:
        label = row.get("facetValue", "")
        if not label or label in ("NaN", "nan", ""):
            continue
        if text_filter and text_filter.lower() not in label.lower():
            continue
        try:
            count = int(float(row.get("count", 0)))
        except (ValueError, TypeError):
            count = 0
        values.append({"value": label, "label": label, "count": count})

    return values[:limit]
