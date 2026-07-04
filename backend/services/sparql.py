"""
ZAC Platform — SPARQL Service + FilterEngine
Handles all communication with QLever triplestore.
FilterEngine builds SPARQL filter snippets from config — no hardcoding in routers.
"""

import httpx
import logging
import json
from typing import Any, Dict, List, Optional

logger = logging.getLogger("zac.sparql")

PREFIXES = """
PREFIX crm: <http://www.cidoc-crm.org/cidoc-crm/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX aat: <http://vocab.getty.edu/aat/>
PREFIX zac: <http://w3id.org/zac/>
"""


class SparqlService:
    """Async HTTP client for QLever/Blazegraph SPARQL endpoint."""

    def __init__(self, host: str, port: int, endpoint: str, named_graph: str, timeout: int = 30):
        self.base_url    = f"http://{host}:{port}{endpoint}"
        self.named_graph = named_graph
        self.timeout     = timeout
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def query(self, sparql: str, add_prefixes: bool = False) -> Dict[str, Any]:
        full_query = (PREFIXES + "\n" + sparql) if add_prefixes else sparql
        logger.debug(f"SPARQL:\n{full_query[:300]}")
        try:
            resp = await self.client.get(
                self.base_url,
                params={"query": full_query},
                headers={"Accept": "application/sparql-results+json"},
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"SPARQL HTTP {e.response.status_code}: {e.response.text[:400]}")
            raise SparqlError(f"Triplestore error {e.response.status_code}") from e
        except httpx.RequestError as e:
            logger.error(f"SPARQL connection error: {e}")
            raise SparqlError(f"Cannot connect to triplestore: {e}") from e
        except json.JSONDecodeError as e:
            raise SparqlError("Invalid JSON from triplestore") from e

    def parse_bindings(self, results: Dict[str, Any]) -> List[Dict[str, str]]:
        rows = []
        for binding in results.get("results", {}).get("bindings", []):
            rows.append({var: cell.get("value", "") for var, cell in binding.items()})
        return rows

    async def select(self, sparql: str) -> List[Dict[str, str]]:
        raw = await self.query(sparql)
        return self.parse_bindings(raw)

    async def count(self, sparql: str) -> int:
        rows = await self.select(sparql)
        if rows:
            val = next(iter(rows[0].values()), "0")
            try:
                return int(float(val))
            except (ValueError, TypeError):
                return 0
        return 0

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()


    # ─── CATALOGUE (CERCA) THUMBNAIL LOADING ────────────────────────────

    async def manifest_urls_batch(self, uris: list[str]) -> dict[str, str]:
        """Una sola query per N URI: risolve il manifest per ognuno (catalogo o asta)."""
        if not uris:
            return {}
        values = " ".join(f"<{u}>" for u in uris)
        q = f"""SELECT ?item ?m WHERE {{
          VALUES ?item {{ {values} }}
          {{ ?item crm:P138i_has_representation ?m }}
          UNION
          {{ ?doc crm:P70_documents ?item ; crm:P138i_has_representation ?m }}
        }}"""
        rows = self.parse_bindings(await self.query(q, add_prefixes=True))
        out = {}
        for r in rows:
            if r.get("item") and r.get("m") and r["item"] not in out:
                out[r["item"]] = r["m"]
        return out

    async def fetch_thumbnail_from_manifest(self, manifest_url: str) -> Optional[str]:
        try:
            r = await self.client.get(manifest_url, headers={"Accept": "application/json"})
            r.raise_for_status()
            m = r.json()
        except (httpx.HTTPError, ValueError):
            return None
        try:
            thumb = m["sequences"][0]["canvases"][0]["thumbnail"]
        except (KeyError, IndexError, TypeError):
            return None
        if isinstance(thumb, list):
            thumb = thumb[0]
        return thumb.get("@id") if isinstance(thumb, dict) else thumb

    async def thumbnails_batch(self, uris: list[str], cache=None) -> dict[str, Optional[str]]:
        """Risolve thumbnail per N URI: 1 query SPARQL + fetch manifest solo per i cache-miss."""
        result: dict[str, Optional[str]] = {}
        to_lookup = []
        for u in uris:
            if cache is not None:
                cached = cache.get(f"thumb:{u}")
                if cached is not None:
                    result[u] = cached if cached != "__none__" else None
                    continue
            to_lookup.append(u)

        if to_lookup:
            manifest_map = await self.manifest_urls_batch(to_lookup)
            import asyncio as _asyncio
            manifest_urls = [manifest_map.get(u) for u in to_lookup]
            fetched = await _asyncio.gather(*(
                self.fetch_thumbnail_from_manifest(m) if m else _asyncio.sleep(0, result=None)
                for m in manifest_urls
            ))
            for u, t in zip(to_lookup, fetched):
                result[u] = t
                if cache is not None:
                    cache.set(f"thumb:{u}", t if t is not None else "__none__", ttl=86400)

        return result
    
    async def manifest_url_for(self, uri: str) -> Optional[str]:
        m = await self.manifest_urls_batch([uri])
        return m.get(uri)


class SparqlError(Exception):
    pass


# ─── Config-Driven Filter Engine ────────────────────────────

class FilterEngine:
    """
    Builds SPARQL filter clauses by reading snippets from sparql_queries.yaml
    via ConfigService. Zero filter logic hardcoded in routers.

    Usage:
        engine = FilterEngine(config, tab="cataloghi")
        engine.apply(facet_id="lingua",       values=["Français"])
        engine.apply(facet_id="periodo_asta", year_from=1880, year_to=1920)
        engine.apply(facet_id="nome_asta",    text="Sotheby")
        engine.apply(facet_id="illustrazioni", boolean=True)
        filters_block = engine.build()
        query = base_query.replace("{FILTERS}", filters_block)
    """

    def __init__(self, config, tab: str):
        self._config  = config
        self._tab     = tab
        self._clauses: List[str] = []

    def apply(
        self,
        facet_id: str,
        *,
        values: Optional[List[str]] = None,
        year_from: Optional[int]    = None,
        year_to:   Optional[int]    = None,
        text:      Optional[str]    = None,
        boolean:   Optional[bool]   = None,
    ) -> "FilterEngine":
        """Apply a single facet filter. Returns self for chaining."""

        if values:
            snippet = self._config.get_filter_snippet(self._tab, facet_id, "multiselect")
            if snippet:
                values_clause = " ".join(f"<{v}>" for v in values)

                self._clauses.append(snippet.replace("{values_clause}", values_clause))

        elif year_from is not None or year_to is not None:
            snippet = self._config.get_filter_snippet(self._tab, facet_id, "year_range")
            if snippet:
                yf = year_from if year_from is not None else 1000
                yt = year_to   if year_to   is not None else 9999
                self._clauses.append(
                    snippet.replace("{year_from}", str(yf)).replace("{year_to}", str(yt))
                )

        elif text:
            snippet = self._config.get_filter_snippet(self._tab, facet_id, "text_search")
            if snippet:
                escaped = text.replace('"', '\\"')
                self._clauses.append(snippet.replace("{text_value}", escaped))

        elif boolean is not None:
            stype   = "boolean_true" if boolean else "boolean_false"
            snippet = self._config.get_filter_snippet(self._tab, facet_id, stype)
            if snippet:
                self._clauses.append(snippet)

        return self

    def apply_search(self, text: Optional[str] = None) -> "FilterEngine":
        """
        Applica la ricerca libera per parola chiave (barra di ricerca).
        Usa lo snippet '{tab}___search' / 'text_search' definito in
        sparql_queries.yaml (facet_id convenzionale "_search").
        """
        if text:
            snippet = self._config.get_filter_snippet(self._tab, "_search", "text_search")
            if snippet:
                escaped = text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
                self._clauses.append(snippet.replace("{text_value}", escaped))
        return self

    def build(self) -> str:
        """Return combined SPARQL filter block."""
        return "\n".join(self._clauses) if self._clauses else ""

    def build_query(self, template: str, limit: int, offset: int, order_by: str = "") -> str:
        """Inject filters + ordering + pagination into a query template.
        Se order_by è vuoto, l'intera clausola 'ORDER BY {ORDER}' viene rimossa
        (altrimenti 'ORDER BY' senza argomenti è SPARQL invalido → query fallisce)."""
        q = template.replace("{FILTERS}", self.build())
        if order_by:
            q = q.replace("{ORDER}", order_by)
        else:
            q = q.replace("ORDER BY {ORDER}", "")
        return (
            q
            .replace("{limit}",  str(limit))
            .replace("{offset}", str(offset))
        )