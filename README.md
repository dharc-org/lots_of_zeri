# ZAC — Zeri Auction Catalogues

Piattaforma di ricerca per i cataloghi d'asta storici (1860–1940) della Fondazione Federico Zeri, sviluppata dal centro DHarc dell'Università di Bologna. La piattaforma pubblica i dati d'asta — cataloghi, eventi e lotti — come Linked Open Data secondo il modello CIDOC-CRM con application profile Linked Art, e li rende interrogabili tramite tre ricerche a faccette.

Il deploy di riferimento è disponibile all'indirizzo `http://137.204.64.39/lots_of_zeri/`, servito dietro reverse proxy con base path `/lots_of_zeri`.

## Architettura

Il sistema è composto da tre servizi orchestrati via Docker Compose.

| Servizio | Funzione | Porta |
|---|---|---|
| `qlever-indexer` | Costruzione dell'indice binario a partire dai file RDF. Esecuzione singola (one-shot). | — |
| `qlever` | Server SPARQL 1.1 sull'indice generato. | 7001 |
| `zac-api` | Backend FastAPI: API REST e rendering server-side delle interfacce. | 5432 |

Il backend espone tre schede, ciascuna con una ricerca a faccette che interroga il triplestore via SPARQL:

- **Aste** — eventi d'asta, modellati come `crm:E7_Activity`;
- **Cataloghi** — documenti di catalogo, modellati come `crm:E31_Document`;
- **Lotti** — insiemi di lotti, modellati come `la:Set`.

## Configurazione

La piattaforma è interamente guidata da configurazione. Faccette, query SPARQL e resa delle schede risultato sono definite in tre file YAML, montati nel container in sola lettura sotto `/app/config`. L'aggiunta di una faccetta o di una scheda richiede la sola modifica dei file YAML, senza interventi sul codice Python o sui template.

```
config/
├── settings.yaml          Parametri di server, connessione al triplestore e cache.
├── facets.yaml            Definizione di schede, faccette, etichette d'interfaccia,
│                          campi di risultato (result_fields) e descrittori di card (display).
└── sparql_queries.yaml    Template delle query SPARQL (faccette, risultati, dettaglio).
```

## Requisiti

- Docker e Docker Compose.
- I file di dati RDF in formato Turtle, collocati nella directory `./data`.

I comandi riportati in questa guida usano `curl` e `grep`, disponibili nativamente su macOS e Linux. Su Windows, in PowerShell, sostituire `curl` con `curl.exe` e `grep` con `Select-String`.

I file RDF caricati sono elencati nella direttiva `command` del servizio `qlever-indexer` in `docker-compose.yml`. La configurazione corrente indicizza:

```
data/
├── zac_catalogues_metadata_8_7_2026.ttl
└── zac_lot_descriptions_24_08_2026.ttl
```

Per indicizzare file diversi è sufficiente aggiornare le direttive `-f <file> -F ttl` in `docker-compose.yml`, alla voce `qlever-indexer > command`.

## Modello dati

I dati seguono il modello CIDOC-CRM con application profile Linked Art. Le classi principali sono le seguenti.

| Classe | Ruolo |
|---|---|
| `crm:E7_Activity` | Evento d'asta. |
| `crm:E31_Document` | Catalogo d'asta. |
| `la:Set` | Insieme di lotti. |
| `crm:E13_Attribute_Assignment` | Assegnazione di ruoli ai contributori (tipizzati via Getty AAT). |
| `crm:E78_Curated_Holding` | Collezione posta in vendita. |
| `crm:E52_Time-Span` | Intervallo temporale dell'asta. |

L'indirizzamento delle entità segue lo schema `http://w3id.org/zac/{slug}`.

## Operazioni

### Primo avvio

Con i file Turtle presenti in `./data`, avviare l'intero stack dalla radice del repository:

```bash
docker compose up -d
```

L'ordine di avvio è governato dalle dipendenze dichiarate nel compose:

1. `qlever-indexer` verifica la presenza del file sentinella `/index/.build_done` sul volume `qlever-index`. In sua assenza costruisce l'indice in `/index/zac` e, al termine, crea il sentinella.
2. `qlever` attende il completamento dell'indexer e avvia il server SPARQL sulla porta 7001.
3. `zac-api` attende l'esito positivo dell'healthcheck di QLever e avvia l'applicazione sulla porta 5432.

Ad avvio completato, l'interfaccia è raggiungibile su `http://localhost:5432/`. In ambiente locale il base path è vuoto; in produzione corrisponde a `/lots_of_zeri`. La verifica dello stato si effettua con:

```bash
docker compose ps
curl "http://localhost:5432/api/aste/results?limit=3"
```

Agli avvii successivi il comando è idempotente: l'indexer rileva il file sentinella e omette la ricostruzione, mentre QLever riparte sull'indice esistente.

### Aggiornamento dei dati

Da eseguire quando cambiano i file RDF. Comporta la ricostruzione dell'indice.

1. Copiare i nuovi file in `./data` e, se i nomi sono variati, aggiornarli in `docker-compose.yml` alla voce `qlever-indexer > command`.
2. Scartare l'indice esistente e ricostruire:

```bash
docker compose down -v
docker compose up -d
```

`down -v` rimuove il volume dell'indice `qlever-index`; i file sorgente in `./data` non sono interessati, essendo montati in sola lettura. La stessa procedura si applica quando occorre ricostruire l'indice a parità di dati (corruzione, cambio di versione dell'immagine QLever).

### Aggiornamento della configurazione

Da eseguire dopo una modifica ai file YAML in `./config`. Non richiede la ricostruzione dell'indice.

```bash
docker compose up -d --force-recreate --no-deps zac-api
```

I file YAML sono caricati una sola volta all'avvio del ciclo di vita dell'applicazione, per cui è necessaria la ricreazione del container. Il comando `docker compose restart zac-api` non è sufficiente.

Le modifiche a template HTML, JavaScript, CSS e moduli Python non richiedono alcun comando: il repository è montato in bind-mount e Uvicorn è avviato con `--reload`, che ricarica automaticamente il codice.

## Comandi operativi

Consultazione dei log:

```bash
docker compose logs -f --tail=50 zac-api
docker compose logs -f qlever
```

Verifiche di stato:

```bash
curl "http://localhost:7001/api?query=ASK%7B%7D"
curl "http://localhost:5432/api/aste/results?limit=1"
```

Esecuzione di query SPARQL dirette. Le query di lunghezza rilevante vanno inviate in POST: QLever impone un limite alla dimensione dell'header nelle richieste GET.

```bash
curl -s -X POST http://localhost:7001 \
  -H "Content-Type: application/sparql-query" \
  --data-binary "SELECT * WHERE { ?s ?p ?o } LIMIT 5"
```

## Note di deployment

**Versione dell'immagine QLever.** L'uso del tag mobile `adfreiburg/qlever:latest` espone al rischio di incompatibilità del formato dell'indice tra indexer e server, con conseguente fallimento dell'avvio. Si raccomanda di fissare un tag specifico e identico su entrambi i servizi:

```yaml
image: adfreiburg/qlever:commit-XXXXXXX
```

Ogni cambio di tag comporta la ricostruzione dell'indice.

**Reverse proxy e base path.** In produzione l'applicazione è servita sotto il prefisso `/lots_of_zeri`. Il valore va comunicato all'API tramite la variabile d'ambiente `ZAC_BASE_PATH` e instradato dal reverse proxy verso la porta 5432. Configurazione Nginx di esempio:

```nginx
location /lots_of_zeri/ {
    proxy_pass http://127.0.0.1:5432/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Separazione fra sviluppo e produzione.** La configurazione di produzione dovrebbe rimuovere l'opzione `--reload` e il bind-mount `.:/app` — mantenendo il solo montaggio in sola lettura di `./config` — a favore dell'immagine costruita, e non esporre la porta 7001 verso l'esterno, così che QLever resti raggiungibile unicamente sulla rete interna `zac-net` (l'API vi accede tramite `QLEVER_HOST=qlever`).

**Allocazione delle risorse.** Il server QLever è avviato con i parametri `-m 2GB` (memoria totale), `-c 1GB` (cache), `-e 256MB` (dimensione dei risultati) e `-j 4` (thread), da rivedere al crescere del grafo o dell'onere delle query di aggregazione.

**Persistenza e backup.** L'indice risiede nel volume nominato `qlever-index`, i dati sorgente in `./data`. Il backup deve comprendere i file RDF in `./data` e i tre file di configurazione in `./config`. L'indice non richiede backup, essendo rigenerabile a partire da tali sorgenti.