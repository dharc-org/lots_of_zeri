"""
ZAC — main.py
Single entry point. All browse tabs are driven by config (facets.yaml),
registered dynamically by browse.py. No per-tab router files.
"""
import os
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from backend.routers import browse
from backend.routers import esplora as esplora_api
from backend.services.sparql import SparqlService
from backend.services.cache import CacheService
from backend.services.config import ConfigService

BASE = Path(__file__).parent

# Prefisso di deploy (es. "/lots_of_zeri"); vuoto in locale.
BASE_PATH = os.environ.get("ZAC_BASE_PATH", "").rstrip("/")


def _load_config() -> ConfigService:
    with open(BASE / "config" / "settings.yaml")       as f: settings = yaml.safe_load(f)
    with open(BASE / "config" / "facets.yaml")          as f: facets   = yaml.safe_load(f)
    with open(BASE  / "config" / "sparql_queries.yaml") as f: queries  = yaml.safe_load(f)
    with open(BASE  / "config" / "detail_views.yaml")   as f: detail   = yaml.safe_load(f)
    return ConfigService({"settings": settings, "facets": facets,
                          "sparql_queries": queries, "detail_views": detail})


# ── Load config and register routes at import time (before app starts) ──
_cfg = _load_config()

templates = Jinja2Templates(directory=BASE / "frontend" / "templates")
browse.setup(templates)
browse.register_tab_routes(_cfg)        

LINGUE_ESTESE = {
    "it": "Italiano", "fr": "Francese", "de": "Tedesco",
    "en": "Inglese", "nl": "Olandese", "es": "Spagnolo",
    "la": "Latino", "pt": "Portoghese", "ru": "Russo",
}

def lingua_estesa(codice: str) -> str:
    if not codice:
        return codice
    return LINGUE_ESTESE.get(codice.strip().lower(), codice)

templates.env.filters["lingua_estesa"] = lingua_estesa
templates.env.globals["base_path"] = BASE_PATH


@asynccontextmanager
async def lifespan(app: FastAPI):
    ts = _cfg._settings["triplestore"]
    app.state.config = _cfg
    app.state.sparql = SparqlService(
        host=ts["host"], port=ts["port"],
        endpoint=ts["endpoint"], named_graph=ts["named_graph"]
    )
    app.state.cache = CacheService()
    yield
    await app.state.sparql.close()


app = FastAPI(title="ZAC — Zeri Auction Catalogues",
              lifespan=lifespan, root_path=BASE_PATH)
app.mount("/static", StaticFiles(directory=BASE / "frontend" / "static"), name="static")

app.include_router(browse.router)
app.include_router(esplora_api.router)


@app.exception_handler(500)
async def internal_error(request: Request, exc: Exception):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "Internal server error"}, status_code=500)
    return templates.TemplateResponse("500.html", {
        "request": request,
        "active_tab": None,
        "active_page": None,
    }, status_code=500)


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {
        "request":    request,
        "active_tab": None,
        "active_page": "home"
    })

@app.get("/progetto", response_class=HTMLResponse)
async def progetto(request: Request):
    return templates.TemplateResponse("progetto.html", {
        "request": request,
        "active_tab": None,
        "active_page": "progetto",
    })

@app.get("/esplora", response_class=HTMLResponse)
async def esplora(request: Request):
    return templates.TemplateResponse("esplora.html", {
        "request": request,
        "active_tab": None,
        "active_page": "esplora",
    })

@app.get("/esplora-racconto", response_class=HTMLResponse)
async def esplora_racconto(request: Request):
    return templates.TemplateResponse("esplora_racconto.html", {
        "request": request,
        "active_tab": None,
        "active_page": "esplora",
    })

@app.get("/approfondisci", response_class=HTMLResponse)
async def approfondisci(request: Request):
    return templates.TemplateResponse("approfondisci.html", {
        "request": request,
        "active_tab": None,
        "active_page": "approfondisci",
    })

@app.get("/guida-alla-ricerca", response_class=HTMLResponse)
async def guida_alla_ricerca(request: Request):
    return templates.TemplateResponse("guida_alla_ricerca.html", {
        "request": request,
        "active_tab": None,
        "active_page": "guida",
    })

@app.get("/contatti", response_class=HTMLResponse)
async def contatti(request: Request):
    return templates.TemplateResponse("contatti.html", {
        "request": request,
        "active_tab": None,
        "active_page": "contatti",
    })

@app.get("/crediti", response_class=HTMLResponse)
async def crediti(request: Request):
    return templates.TemplateResponse("crediti.html", {
        "request": request,
        "active_tab": None,
        "active_page": "crediti",
    })