"""
ZAC Platform — Config Service
Single source of truth for all configuration.
Reads facets.yaml and sparql_queries.yaml.
"""

from typing import Any, Dict, List, Optional


class ConfigService:
    """Wraps raw YAML configs with typed accessors."""

    def __init__(self, config: dict):
        self._settings = config.get("settings", {})
        self._facets   = config.get("facets", {})
        self._queries  = config.get("sparql_queries", {})

    # ─── Triplestore ────────────────────────────────────────
    @property
    def triplestore_url(self) -> str:
        ts = self._settings["triplestore"]
        return f"http://{ts['host']}:{ts['port']}{ts['endpoint']}"

    @property
    def named_graph(self) -> str:
        return self._settings["triplestore"]["named_graph"]

    # ─── Tab / Facet config ─────────────────────────────────
    def get_tab_config(self, tab: str) -> Optional[dict]:
        return self._facets.get(tab)

    def get_facets_for_tab(self, tab: str) -> Dict[str, dict]:
        tab_cfg = self.get_tab_config(tab)
        return tab_cfg.get("facets", {}) if tab_cfg else {}

    def get_facet(self, tab: str, facet_name: str) -> Optional[dict]:
        return self.get_facets_for_tab(tab).get(facet_name)

    def is_tab_enabled(self, tab: str) -> bool:
        cfg = self.get_tab_config(tab)
        return cfg.get("enabled", True) if cfg else False

    # ─── SPARQL Queries ─────────────────────────────────────
    def get_prefixes(self) -> str:
        return self._queries.get("prefixes", "")

    def get_facet_query_by_key(self, key: str) -> Optional[str]:
        """
        Lookup a facet value query by composite key '{tab}__{facet_id}'.
        Defined in sparql_queries.yaml under facet_queries.
        Returns None if not found (facet silently skipped).
        """
        return self._queries.get("facet_queries", {}).get(key)

    def get_filter_snippet(self, tab: str, facet_id: str, snippet_type: str) -> Optional[str]:
        """
        Lookup a SPARQL filter snippet for {tab}__{facet_id} and a given
        snippet_type: 'year_range' | 'multiselect' | 'text_search' |
                      'boolean_true' | 'boolean_false'
        Defined in sparql_queries.yaml under filter_snippets.
        """
        key     = f"{tab}__{facet_id}"
        snippet = self._queries.get("filter_snippets", {}).get(key, {})
        return snippet.get(snippet_type)

    def get_results_query(self, name: str) -> Optional[str]:
        return self._queries.get("results", {}).get(name)

    def get_detail_query(self, name: str) -> Optional[str]:
        return self._queries.get("detail", {}).get(name)

    # ─── Pagination ─────────────────────────────────────────
    @property
    def default_page_size(self) -> int:
        return self._settings.get("pagination", {}).get("default_page_size", 20)

    @property
    def max_page_size(self) -> int:
        return self._settings.get("pagination", {}).get("max_page_size", 100)

    # ─── UI ─────────────────────────────────────────────────
    def get_ui_config(self) -> dict:
        return self._facets.get("ui", {})

    def get_tabs_meta(self) -> List[dict]:
        """Return tab metadata for frontend tab rendering."""
        tabs = []
        for tab_id in ["eventi_asta", "cataloghi", "lotti"]:
            cfg = self.get_tab_config(tab_id)
            if cfg:
                tabs.append({
                    "id":             tab_id,
                    "label_it":       cfg.get("label_it", tab_id),
                    "label_en":       cfg.get("label_en", tab_id),
                    "description_it": cfg.get("description_it", ""),
                    "description_en": cfg.get("description_en", ""),
                    "enabled":        cfg.get("enabled", True),
                    "facets":         list(cfg.get("facets", {}).keys()),
                })
        return tabs
