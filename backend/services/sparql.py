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

    def build(self) -> str:
        """Return combined SPARQL filter block."""
        return "\n".join(self._clauses) if self._clauses else ""

    def build_query(self, template: str, limit: int, offset: int) -> str:
        """Inject filters + pagination into a query template."""
        return (
            template
            .replace("{FILTERS}", self.build())
            .replace("{limit}",   str(limit))
            .replace("{offset}",  str(offset))
        )
