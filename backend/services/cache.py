"""
ZAC Platform — Cache Service
In-memory LRU cache for SPARQL results.
Extensible to Redis for production multi-worker deployments.
"""

import hashlib
import json
import logging
import time
from collections import OrderedDict
from typing import Any, Optional

logger = logging.getLogger("zac.cache")


class CacheService:
    """
    Simple TTL-aware LRU cache for SPARQL results.
    
    Two TTL tiers:
      - facet_ttl: for facet value queries (long-lived, rarely change)
      - results_ttl: for search result queries (shorter)
    """

    def __init__(
        self,
        backend: str = "memory",
        facet_ttl: int = 3600,
        results_ttl: int = 300,
        max_items: int = 500,
    ):
        self.backend = backend
        self.facet_ttl = facet_ttl
        self.results_ttl = results_ttl
        self.max_items = max_items
        self._store: OrderedDict[str, dict] = OrderedDict()

    def _make_key(self, prefix: str, data: Any) -> str:
        payload = json.dumps(data, sort_keys=True, default=str)
        digest = hashlib.sha256(payload.encode()).hexdigest()[:16]
        return f"{prefix}:{digest}"

    def get(self, key: str) -> Optional[Any]:
        if key not in self._store:
            return None
        entry = self._store[key]
        if time.time() > entry["expires"]:
            del self._store[key]
            logger.debug(f"Cache EXPIRED: {key}")
            return None
        # Move to end (LRU)
        self._store.move_to_end(key)
        logger.debug(f"Cache HIT: {key}")
        return entry["value"]

    def set(self, key: str, value: Any, ttl: int):
        if key in self._store:
            self._store.move_to_end(key)
        self._store[key] = {
            "value": value,
            "expires": time.time() + ttl,
        }
        # Evict oldest if over capacity
        while len(self._store) > self.max_items:
            evicted = self._store.popitem(last=False)
            logger.debug(f"Cache EVICT: {evicted[0]}")
        logger.debug(f"Cache SET: {key} (ttl={ttl}s)")

    def get_or_none(self, namespace: str, params: dict) -> Optional[Any]:
        key = self._make_key(namespace, params)
        return self.get(key)

    def set_facet(self, namespace: str, params: dict, value: Any):
        key = self._make_key(namespace, params)
        self.set(key, value, self.facet_ttl)

    def set_results(self, namespace: str, params: dict, value: Any):
        key = self._make_key(namespace, params)
        self.set(key, value, self.results_ttl)

    def invalidate_all(self):
        self._store.clear()
        logger.info("Cache CLEARED")

    def stats(self) -> dict:
        now = time.time()
        alive = sum(1 for e in self._store.values() if now <= e["expires"])
        return {
            "total_entries": len(self._store),
            "alive_entries": alive,
            "max_items": self.max_items,
        }
