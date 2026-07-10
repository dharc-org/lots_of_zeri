"""
genera_json_esplora.py

Genera i tre file JSON per le tab "Stagionalità", "Geografia del mercato"
e "Collezioni" della sezione Esplora, a partire dal file Excel dei metadati
Zeri (foglio "Zeri EVENTO ASTA").

Uso:
    python3 genera_json_esplora.py METADATI-ZERI-2026-05-27_DEFINITIVO_SOLO\ DIGITALIZZATI.xlsx --out data/

Produce in --out (default: ./data/):
    stagionalita.json
    geografia_decenni.json
    collezioni.json

Note metodologiche incorporate nello script (vedi commenti inline):
  - Il periodo di riferimento è 1879-1929 (corpus digitalizzato). ATTENZIONE:
    il file sorgente contiene in realtà eventi fino al 1939 (32 eventi,
    l'1,7% del totale) che questo filtro esclude di proposito per restare
    coerenti con la data usata nel resto del sito. Da riverificare se si
    decide di estendere il periodo ovunque.
  - Stagionalità: solo Germania, Francia, Italia (i tre fondi che coprono
    circa il 95% del corpus); percentuali calcolate sul totale annuo di
    ciascun paese, non sul totale complessivo.
  - Geografia: top 10 città per decennio (1879-1929, con il bucket
    1879-89 trattato come decennio incompleto da 11 anni) + bucket
    residuale "altre città"; scala condivisa fra tutti i decenni.
  - Collezioni: classifica delle 15 collezioni più ricorrenti, con
    etichetta "stesso anno" / "stessa casa" / "case diverse" calcolata
    incrociando l'arco di anni e il numero di case d'asta distinte.
"""

import argparse
import json
from collections import Counter
from pathlib import Path

import pandas as pd

ANNO_MIN, ANNO_MAX = 1879, 1929
FOGLIO_EVENTI = "Zeri EVENTO ASTA"


def carica_eventi(xlsx_path):
    """Carica il foglio 'Zeri EVENTO ASTA', salta la riga di mapping Dublin
    Core (riga 1) e filtra sul periodo del corpus digitalizzato."""
    xl = pd.ExcelFile(xlsx_path)
    df = xl.parse(FOGLIO_EVENTI, skiprows=[1])
    df["year"] = df["DATA INIZIO"].astype(str).str[:4].astype(int)
    df = df[(df["year"] >= ANNO_MIN) & (df["year"] <= ANNO_MAX)].copy()
    return df


# ──────────────────────────────────────────────────────────────
# 1. STAGIONALITÀ — distribuzione mensile per tutti i fondi con
#    almeno MIN_ASTE_STAGIONALITA aste documentate nel periodo
# ──────────────────────────────────────────────────────────────
MIN_ASTE_STAGIONALITA = 10


def genera_stagionalita(df):
    dfm = df.copy()
    dfm["d0"] = pd.to_datetime(dfm["DATA INIZIO"].astype(str), format="%Y%m%d", errors="coerce")
    dfm["month"] = dfm["d0"].dt.month
    dfm = dfm.dropna(subset=["month"])
    dfm["month"] = dfm["month"].astype(int)

    by_country = (
        dfm.groupby(["FONDO", "month"])
        .size()
        .unstack(fill_value=0)
        .reindex(columns=range(1, 13), fill_value=0)
    )

    totals = by_country.sum(axis=1).sort_values(ascending=False)
    countries = []
    for nome, tot in totals.items():
        if tot < MIN_ASTE_STAGIONALITA:
            continue
        row = by_country.loc[nome]
        countries.append({"n": nome, "tot": int(tot), "m": [int(v) for v in row.tolist()]})

    return {
        "period": f"{ANNO_MIN}–{ANNO_MAX}",
        "months": ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"],
        "min_aste": MIN_ASTE_STAGIONALITA,
        "countries": countries,
    }


# ──────────────────────────────────────────────────────────────
# 2. GEOGRAFIA DEL MERCATO — top 10 città + "altre" per decennio
# ──────────────────────────────────────────────────────────────
def _decade_bucket(year):
    """1879-1889 è un bucket unico da 11 anni (il corpus parte nel 1879,
    troppo poco per un decennio pieno); dal 1890 in poi decenni standard."""
    if ANNO_MIN <= year <= 1889:
        return 1879
    return (year // 10) * 10


def genera_geografia(df, anno_min_decadi=ANNO_MIN, top_n=10):
    d = df[(df["year"] >= anno_min_decadi) & (df["year"] <= ANNO_MAX)].copy()
    d["decade"] = d["year"].apply(_decade_bucket)

    decadi_label = [
        (1879, "1879–89"),
        (1890, "1890–99"),
        (1900, "1900–09"),
        (1910, "1910–19"),
        (1920, "1920–29"),
    ]

    decades_out = []
    for dec, label in decadi_label:
        sub = d[d["decade"] == dec]
        vc = sub["LUOGO"].value_counts()
        top = vc.head(top_n)
        resto = vc.iloc[top_n:]
        tot = int(len(sub))
        top_sum = int(top.sum())
        decades_out.append(
            {
                "label": label,
                "tot": tot,
                "top": [{"n": n, "v": int(v)} for n, v in top.items()],
                "altre": tot - top_sum,
                "resto": [{"n": n, "v": int(v)} for n, v in resto.items()],
            }
        )

    scale_max = max(t["v"] for dec in decades_out for t in dec["top"])

    return {
        "period": f"{anno_min_decadi}–{ANNO_MAX}",
        "scale_max": int(scale_max),
        "decades": decades_out,
    }


# ──────────────────────────────────────────────────────────────
# 3. COLLEZIONI — ricomparse in più eventi d'asta
# ──────────────────────────────────────────────────────────────
def _classifica_tag(years, houses_counter):
    n_years = len(set(years))
    n_houses = len([k for k in houses_counter if k != "non specificata"])
    if n_years == 1:
        return "anno"
    if n_houses <= 1:
        return "casa"
    return "diverse"


def genera_collezioni(df, top_n=15):
    sub = df.dropna(subset=["COLLEZIONI_IN VENDITA"]).copy()
    sub["coll_list"] = sub["COLLEZIONI_IN VENDITA"].str.split(";")
    exploded = sub.explode("coll_list")
    exploded["coll_list"] = exploded["coll_list"].str.strip()

    vc = exploded["coll_list"].value_counts()
    totale = int(len(vc))
    ricorrenti = int((vc >= 2).sum())
    singole = int((vc == 1).sum())
    pct_ricorrenti = round(ricorrenti / totale * 100)

    top_names = vc.head(top_n).index.tolist()

    items = []
    for name in top_names:
        rows = exploded[exploded["coll_list"] == name]
        years = sorted(rows["year"].tolist())
        orgs_raw = rows["ORGANIZZATORE"].fillna("non specificata").tolist()
        oc = Counter(orgs_raw)

        tag = _classifica_tag(years, oc)
        y0, y1 = min(years), max(years)
        periodo = f"{y0}" if y0 == y1 else f"{y0}–{y1}"
        case = [{"n": k, "v": v} for k, v in sorted(oc.items(), key=lambda kv: -kv[1])]
        display_name = name.replace("COLLEZIONE ", "").title()

        items.append(
            {
                "n": display_name,
                "c": int(len(rows)),
                "tag": tag,
                "anni": [y0, y1],
                "periodo": periodo,
                "case": case,
            }
        )

    return {
        "stats": {
            "totale": totale,
            "ricorrenti": ricorrenti,
            "pct_ricorrenti": int(pct_ricorrenti),
            "singole": singole,
        },
        "max": int(max(it["c"] for it in items)) if items else 0,
        "tag_labels": {"anno": "stesso anno", "casa": "stessa casa", "diverse": "case diverse"},
        "items": items,
    }


def main():
    parser = argparse.ArgumentParser(description="Genera i JSON per Esplora (stagionalità, geografia, collezioni).")
    parser.add_argument("xlsx", help="Percorso del file METADATI-ZERI-*.xlsx")
    parser.add_argument("--out", default="data", help="Cartella di destinazione dei JSON (default: ./data)")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = carica_eventi(args.xlsx)

    dataset = {
        "stagionalita.json": genera_stagionalita(df),
        "geografia_decenni.json": genera_geografia(df),
        "collezioni.json": genera_collezioni(df),
    }

    for filename, payload in dataset.items():
        path = out_dir / filename
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
        print(f"scritto {path}")

    s = dataset["stagionalita.json"]
    g = dataset["geografia_decenni.json"]
    c = dataset["collezioni.json"]
    print()
    print("── riepilogo ──")
    print("stagionalita:", ", ".join(f"{p['n']} ({p['tot']} aste)" for p in s["countries"]))
    print("geografia: scale_max =", g["scale_max"], "-", ", ".join(f"{d['label']} (tot {d['tot']}, leader {d['top'][0]['n']})" for d in g["decades"]))
    print("collezioni:", c["stats"], "- top:", c["items"][0]["n"], c["items"][0]["c"])


if __name__ == "__main__":
    main()
