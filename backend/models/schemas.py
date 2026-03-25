"""
ZAC Platform — Pydantic Models
Request/Response schemas for the API.
"""

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


# ─── Generic Response Envelope ──────────────────────────────

class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int


class ApiResponse(BaseModel):
    success: bool = True
    data: Any
    meta: Optional[dict] = None


class PaginatedResponse(BaseModel):
    success: bool = True
    data: List[Any]
    pagination: PaginationMeta
    sparql_query: Optional[str] = None  # returned for transparency


# ─── Facet Models ───────────────────────────────────────────

class FacetValue(BaseModel):
    value: str
    label: str
    count: int


class FacetDefinition(BaseModel):
    id: str
    label_it: str
    label_en: str
    type: str   # "multiselect" | "range" | "text_search" | "boolean"
    ui_widget: str
    values: Optional[List[FacetValue]] = None
    range: Optional[Dict[str, int]] = None


class FacetsResponse(BaseModel):
    tab: str
    facets: List[FacetDefinition]


# ─── Evento Asta Models ─────────────────────────────────────

class EventoAsta(BaseModel):
    uri: str
    label: str
    house: Optional[str] = None
    year: Optional[str] = None
    time_span: Optional[str] = None
    document_id: Optional[str] = None


class EventiResponse(PaginatedResponse):
    data: List[EventoAsta]


class EventiFilterParams(BaseModel):
    year_from: Optional[int] = Field(None, ge=1800, le=2000)
    year_to: Optional[int] = Field(None, ge=1800, le=2000)
    casa_asta: Optional[List[str]] = None
    luogo: Optional[List[str]] = None
    tipologia_oggetti: Optional[List[str]] = None
    esperti: Optional[List[str]] = None
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


# ─── Catalogo Models ────────────────────────────────────────

class CatalogoItem(BaseModel):
    uri: str
    doc_id: Optional[str] = None
    title: Optional[str] = None
    year: Optional[str] = None
    house: Optional[str] = None
    language: Optional[str] = None
    label: Optional[str] = None


class CatalogoResponse(PaginatedResponse):
    data: List[CatalogoItem]


class CatalogoFilterParams(BaseModel):
    tipologia_oggetti: Optional[List[str]] = None
    year_from: Optional[int] = Field(None, ge=1800, le=2000)
    year_to: Optional[int] = Field(None, ge=1800, le=2000)
    nome_asta: Optional[str] = None
    collezione: Optional[List[str]] = None
    illustrazioni: Optional[bool] = None
    contributori: Optional[List[str]] = None
    lingua: Optional[List[str]] = None
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


# ─── Health ─────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    triplestore: str
    cache: dict
    version: str
