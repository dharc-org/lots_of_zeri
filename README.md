# ZAC Platform — Zeri Auction Catalogues
**Digital Research Platform for Historical Art Auction Markets, 1860–1940**

*Fondazione Federico Zeri — Università di Bologna*

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                     BROWSER (Bootstrap 5)                  │
│         Tab 1: Eventi Asta  │  Tab 2: Catalogo             │
│         (Faceted SPARQL Search over CIDOC-CRM RDF)         │
└─────────────────────┬──────────────────────────────────────┘
                      │ HTTP REST
┌─────────────────────▼──────────────────────────────────────┐
│               FastAPI Backend (Python 3.11)                │
│  /api/facets/{tab}     → facet values (cached 1h)          │
│  /api/eventi           → auction event search              │
│  /api/catalogo         → catalogue search                  │
│  /api/health           → health check                      │
└─────────────────────┬──────────────────────────────────────┘
                      │ SPARQL HTTP
┌─────────────────────▼──────────────────────────────────────┐
│          QLever Triplestore (RDF/SPARQL 1.1)               │
│          Named graph: http://w3id.org/zac/catalogues       │
│          Data model: CIDOC-CRM + Linked Art                │
└────────────────────────────────────────────────────────────┘
```

## Data Model

The ZAC dataset uses **CIDOC-CRM** and the **Linked Art application profile**.

### Key Classes

| Class | Role in ZAC |
|-------|-------------|
| `crm:E31_Document` | Auction catalogue (physical/digital document) |
| `crm:E7_Activity` | Auction event / organisational activity |
| `crm:E13_Attribute_Assignment` | Contributor roles (typed via AAT) |
| `crm:E52_Time-Span` | Auction date ranges |
| `crm:E78_Curated_Holding` | Named collections |
| `crm:E56_Language` | Catalogue language |

### Named Graph

All data lives in: `<http://w3id.org/zac/catalogues>`

### Key Predicates

```
E31_Document --P70_documents--> E7_Activity (auction event)
E31_Document --P94i_was_created_by--> E65_Creation
E65_Creation --P82_at_some_time_within--> xsd:gYear (year)
E13_Attribute_Assignment --P141_assigned--> contributor (person/org)
E7_Activity --P14_carried_out_by--> auction house
E7_Activity --P46_is_composed_of--> E78_Curated_Holding (collection)
```

---

## Project Structure

```
zac-platform/
├── main.py                    # FastAPI application entry point
├── Qleverfile                 # QLever index configuration
├── docker-compose.yml         # Docker services (QLever + API)
│
├── config/
│   ├── settings.yaml          # App settings (server, triplestore, cache)
│   ├── facets.yaml            # Facet definitions + UI labels (EDIT THIS)
│   └── sparql_queries.yaml    # SPARQL query templates
│
├── backend/
│   ├── services/
│   │   ├── sparql.py          # QLever HTTP client + filter builder
│   │   ├── cache.py           # LRU in-memory cache
│   │   └── config.py          # Typed config access
│   ├── routers/
│   │   ├── health.py          # GET /api/health
│   │   ├── facets.py          # GET /api/facets/{tab}
│   │   ├── events.py          # GET /api/eventi
│   │   └── catalogue.py       # GET /api/catalogo
│   └── models/
│       └── schemas.py         # Pydantic request/response schemas
│
├── frontend/
│   ├── templates/
│   │   └── index.html         # Main SPA template (Bootstrap 5)
│   └── static/
│       ├── css/style.css
│       └── js/app.js
│
├── data/                      # ← PUT YOUR .trig FILE HERE
│   └── .gitkeep
│
├── docker/
│   ├── Dockerfile
│   └── requirements.txt
│
└── scripts/
    ├── build_index.sh         # QLever index builder
    └── validate_sparql.py     # SPARQL query validation
```

---

## Quick Start

### 1. Prerequisites

- Docker & Docker Compose
- Python 3.11+ (for local development without Docker)

### 2. Copy your data

```bash
cp /path/to/zac_catalogues_16_10_2025.trig ./data/
```

### 3. Start services

```bash
docker compose up -d
```

### 4. Build QLever index

```bash
./scripts/build_index.sh
```

This will:
1. Index the TriG file into QLever's binary format
2. Start the QLever server on port 7001
3. Report when the SPARQL endpoint is ready

### 5. Validate data

```bash
python scripts/validate_sparql.py --host localhost --port 7001
```

### 6. Access the platform

| Service | URL |
|---------|-----|
| ZAC Web Interface | http://localhost:8000 |
| FastAPI Docs (Swagger) | http://localhost:8000/api/docs |
| FastAPI Docs (ReDoc) | http://localhost:8000/api/redoc |
| QLever SPARQL Endpoint | http://localhost:7001/api |

---

## API Reference

### Facets

```http
GET /api/facets/{tab}
```

Returns all facet definitions and their current values for a tab.

- `tab`: `eventi_asta` | `catalogo` | `lotti`

**Response:**
```json
{
  "tab": "catalogo",
  "enabled": true,
  "label_it": "Catalogo",
  "facets": [
    {
      "id": "lingua",
      "label_it": "Lingua",
      "type": "multiselect",
      "ui_widget": "checkbox_list",
      "values": [
        {"value": "de", "label": "de", "count": 312},
        {"value": "fr", "label": "fr", "count": 187}
      ]
    }
  ]
}
```

### Search Catalogo

```http
GET /api/catalogo?year_from=1900&year_to=1930&lingua=de&page=1&page_size=20
```

Query parameters:
- `tipologia_oggetti` (list): object type labels
- `year_from`, `year_to` (int): year range filter
- `nome_asta` (str): text search on auction name/title
- `collezione` (list): collection names
- `contributori` (list): contributor names
- `lingua` (list): language codes
- `page`, `page_size`: pagination

### Search Eventi Asta

```http
GET /api/eventi?year_from=1910&year_to=1920&casa_asta=Galerie+Helbing
```

Query parameters:
- `year_from`, `year_to` (int)
- `casa_asta` (list): auction house names
- `tipologia_oggetti` (list)
- `esperti` (list)
- `page`, `page_size`

---

## Configuration

### Adding/Modifying Facets

Edit `config/facets.yaml` to:
- Add new filter options
- Change Italian/English labels
- Adjust SPARQL patterns for new filters

The file is loaded at startup. In development mode (`reload: true`), changes to YAML configs require a server restart.

### Changing Triplestore Connection

Edit `config/settings.yaml`:
```yaml
triplestore:
  host: "qlever"     # Docker service name or hostname
  port: 7001
  endpoint: "/api"
```

---

## Development

### Local development (no Docker)

```bash
# Install dependencies
pip install -r docker/requirements.txt

# Start QLever locally (or point to remote)
# Edit config/settings.yaml → triplestore.host: "localhost"

# Start Blazegraph
java -server -Xmx4g -jar blazegraph.jar

# Run FastAPI in development mode
uvicorn main:app --reload --port 8000
```

### Running tests

```bash
# Validate SPARQL queries against live triplestore
python scripts/validate_sparql.py

# FastAPI interactive docs for manual testing
open http://localhost:8000/api/docs
```

---

## Extending the Platform

### Adding a new tab (e.g., Lotti)

1. Enable `lotti` tab in `config/facets.yaml` (`enabled: true`)
2. Add SPARQL queries to `config/sparql_queries.yaml`
3. Create `backend/routers/lots.py`
4. Register router in `main.py`

### Adding an analytics/visualization tab

The SPARQL service supports arbitrary queries. You can add new router endpoints that return aggregated data for Chart.js visualizations on the frontend.

---

## Data Credits

- Dataset: ZAC — Zeri Auction Catalogues
- Ontology: CIDOC-CRM (ISO 21127)
- Application Profile: Linked Art
- Namespace: `http://w3id.org/zac/`
- Vocabulary: Getty Art & Architecture Thesaurus (AAT)
