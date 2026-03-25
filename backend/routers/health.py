"""
ZAC Platform — Health Router
"""

import logging
from fastapi import APIRouter, Request
from backend.models.schemas import HealthResponse

router = APIRouter()
logger = logging.getLogger("zac.health")


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request):
    """Check platform and triplestore availability."""
    sparql = request.app.state.sparql
    cache = request.app.state.cache

    # Ping triplestore with minimal query
    triplestore_status = "ok"
    try:
        result = await sparql.select("SELECT (1 AS ?ping) WHERE {}")
        if not result:
            triplestore_status = "empty_response"
    except Exception as e:
        triplestore_status = f"error: {str(e)[:100]}"
        logger.warning(f"Triplestore health check failed: {e}")

    return HealthResponse(
        status="ok" if triplestore_status == "ok" else "degraded",
        triplestore=triplestore_status,
        cache=cache.stats(),
        version="1.0.0",
    )
