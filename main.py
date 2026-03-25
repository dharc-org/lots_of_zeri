"""
ZAC — main.py
Single entry point. All browse tabs are driven by config (facets.yaml),
registered dynamically by browse.py. No per-tab router files.
"""
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from backend.routers import browse
from backend.services.sparql import SparqlService
from backend.services.cache import CacheService
from backend.services.config import ConfigService

BASE = Path(__file__).parent


def _load_config() -> ConfigService:
    with open(BASE / "config" / "settings.yaml")       as f: settings = yaml.safe_load(f)
    with open(BASE / "config" / "facets.yaml")          as f: facets   = yaml.safe_load(f)
    with open(BASE / "config" / "sparql_queries.yaml")  as f: queries  = yaml.safe_load(f)
    return ConfigService({"settings": settings, "facets": facets, "sparql_queries": queries})


# ── Load config and register routes at import time (before app starts) ──
_cfg = _load_config()

templates = Jinja2Templates(directory=BASE / "frontend" / "templates")
browse.setup(templates)
browse.register_tab_routes(_cfg)          # routes added to router BEFORE include_router


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


app = FastAPI(title="ZAC — Zeri Auction Catalogues", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE / "frontend" / "static"), name="static")

app.include_router(browse.router)


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
    })

@app.get("/esplora", response_class=HTMLResponse)
async def progetto(request: Request):
    return templates.TemplateResponse("esplora.html", {
        "request": request,
        "active_tab": None,
    })