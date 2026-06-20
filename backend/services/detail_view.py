"""
ZAC — detail_view.py
Costruisce il dict `view` per detail.html, facendo il merge fra:
  - la config detail_views.yaml (campi, sezioni, correlati)
  - i risultati SPARQL eseguiti per blocco (scalars, multivalore, correlati)

Nessuna logica di presentazione hardcoded: il template itera su `view`.

── Novità: facet_link ────────────────────────────────────────────
Un campo multivalore può dichiarare in detail_views.yaml:
    facet_link: { route: "/cataloghi", param: "lingua" }
In tal caso, se la relativa query multivalore restituisce anche ?uri,
ogni valore diventa un dict {label, url} dove url è:
    {route}?{param}={uri-urlencoded}
e il template lo renderizza come <a href="…">label</a>.
Se manca l'?uri (o facet_link), il valore resta una semplice stringa.
"""
from typing import Any, Dict, List, Optional
from urllib.parse import quote


def _esc_sparql_literal(s: str) -> str:
    """Escape minimale per inserire una stringa in un FILTER(STR(?x) = \"...\")."""
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")


def _extract_year4(val: str) -> Optional[str]:
    """Estrae le prime 4 cifre consecutive da una stringa (es. '1892-01-01' → '1892')."""
    import re
    m = re.search(r"\d{4}", str(val))
    return m.group(0) if m else None


def _format_date(val: Optional[str]) -> Optional[str]:
    """Formatta una data ISO (2025-01-15 → 15/01/2025). Ritorna il valore grezzo se non parsabile."""
    if not val:
        return None
    import re
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", str(val))
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    return val

def _scalar(rows: List[dict], key: str) -> Optional[str]:
    """Primo valore non vuoto per `key` fra le righe (gli scalars sono LIMIT 1)."""
    for r in rows:
        v = r.get(key)
        if v not in (None, "", "NaN"):
            return v
    return None


def _multi(rows: List[dict], key: str = "value") -> List[str]:
    """Lista di valori distinti non vuoti, preservando l'ordine."""
    seen, out = set(), []
    for r in rows:
        v = r.get(key)
        if v in (None, "", "NaN") or v in seen:
            continue
        seen.add(v)
        out.append(v)
    return out


def _multi_linked(rows: List[dict], facet_link: dict,
                  label_key: str = "value", uri_key: str = "uri") -> List[dict]:
    """
    Lista di valori distinti come dict {label, url}.
    url = "{route}?{param}={uri-urlencoded}" se l'URI è presente, altrimenti None.
    De-dup sulla label, preservando l'ordine.
    """
    route = facet_link.get("route", "")
    param = facet_link.get("param", "")
    seen, out = set(), []
    for r in rows:
        label = r.get(label_key)
        if label in (None, "", "NaN") or label in seen:
            continue
        seen.add(label)
        uri = r.get(uri_key)
        url = None
        if uri not in (None, "", "NaN") and route and param:
            url = f"{route}?{param}={quote(str(uri), safe='')}"
        out.append({"label": label, "url": url})
    return out


def build_view(
    kind: str,
    cfg_view: dict,
    *,
    scalars: List[dict],
    multis: Dict[str, List[dict]],
    related: Dict[str, List[dict]],
) -> dict:
    """
    kind        : "catalogo" | "evento" | …
    cfg_view    : la voce di detail_views.yaml per questo tipo
    scalars     : righe della query {kind}_scalars (di norma 1)
    multis      : { field_key → righe della query multivalore }
                  per i contributori la chiave è "contributors" con righe {name, role}
    related     : { block_id → righe della query correlati }
    """
    sc = scalars or [{}]
    row0 = sc[0] if sc else {}

    # Slug/id per i link interni — ricavati dagli scalars
    auction_slug = _scalar(sc, "auctionSlug")
    doc_id       = _scalar(sc, "docId")
    doc_slug     = _scalar(sc, "docSlug")
    link_vals    = {"auctionSlug": auction_slug, "docId": doc_id, "docSlug": doc_slug}

    # ── Switch "Vai a:" ──────────────────────────────────────────────
    switch = []
    for b in cfg_view.get("switch", []):
        entry = {"label_it": b["label_it"], "disabled": b.get("disabled", False)}
        if not entry["disabled"] and "link_key" in b:
            val = link_vals.get(b["link_key"])
            if val:
                entry["url"] = b["route"].replace("{slug}", val).replace("{id}", val)
        switch.append(entry)

    # ── Campi della scheda ───────────────────────────────────────────
    fields = []
    for f in cfg_view.get("fields", []):
        key   = f["key"]
        is_multi = f.get("multi", False)
        out = {
            "label_it": f["label_it"],
            "multi":    is_multi,
            "has_value": False,
        }
        if "pill" in f:
            out["pill"] = f["pill"]

        # Contributori — blocco dedicato con nome+ruolo (+ link opzionale a browse)
        if f.get("kind") == "contributors":
            rows = multis.get("contributors", [])
            facet_link = f.get("facet_link")
            route = facet_link.get("route", "") if facet_link else ""
            param = facet_link.get("param", "") if facet_link else ""
            items = []
            seen = set()
            for r in rows:
                name = r.get("name")
                if not name or name in seen:
                    continue
                seen.add(name)
                url = None
                uri = r.get("uri")
                if facet_link and uri not in (None, "", "NaN") and route and param:
                    url = f"{route}?{param}={quote(str(uri), safe='')}"
                items.append({"name": name, "role": r.get("role") or "", "url": url})
            out["kind"] = "contributors"
            out["vals"] = items
            out["has_value"] = bool(items)

        # Multivalore generico (lingue, tipi oggetto, collezioni…)
        elif is_multi:
            rows = multis.get(key, [])
            facet_link = f.get("facet_link")
            if facet_link:
                # Valori come dict {label, url} → link a browse pre-filtrata
                items = _multi_linked(rows, facet_link)
                out["linked"] = True
                out["vals"] = items
                out["has_value"] = bool(items)
            else:
                # Valori come semplici stringhe
                items = _multi(rows)
                out["linked"] = False
                out["vals"] = items
                out["has_value"] = bool(items)

        # Scalare (eventualmente con link interno o link a faccetta range)
        else:
            val = _scalar(sc, key)

            # Formattazione date ISO → gg/mm/aaaa
            if key in ("dateStart", "dateEnd") and val:
                val = _format_date(val)

            out["value"] = val
            out["has_value"] = val not in (None, "", "NaN")

            # Link interno classico (route + chiave slug/id)
            if out["has_value"] and "link_route" in f and "link_key" in f:
                lv = link_vals.get(f["link_key"])
                if lv:
                    out["link"] = f["link_route"].replace("{slug}", lv).replace("{id}", lv)

            fl = f.get("facet_link")
            if out["has_value"] and fl:
                if fl.get("kind") == "range_year":
                    # Link a faccetta range (es. anno → ?param_from=YYYY&param_to=YYYY)
                    year4 = _extract_year4(val)
                    route = fl.get("route", "")
                    param = fl.get("param", "")
                    if year4 and route and param:
                        out["link"] = (f"{route}?{param}_from={year4}"
                                       f"&{param}_to={year4}")
                else:
                    # Link a faccetta multiselect (scalare con URI separata, es. place)
                    uri_key = fl.get("uri_key", key + "URI")
                    uri_val = _scalar(sc, uri_key)
                    route   = fl.get("route", "")
                    param   = fl.get("param", "")
                    if uri_val and route and param:
                        out["link"] = f"{route}?{param}={quote(str(uri_val), safe='')}"

        fields.append(out)

    # ── Caroselli correlati ──────────────────────────────────────────
    related_out = []
    for block in cfg_view.get("related", []):
        bid  = block["id"]
        rows = related.get(bid, [])
        items = []

        if not block.get("placeholder", False):
            if block["card"] == "catalogo":
                seen = set()
                for r in rows:
                    u = r.get("uri", "")
                    if u in seen:
                        continue
                    seen.add(u)
                    items.append({
                        "doc_id": r.get("docId"),
                        "title":  r.get("title") or r.get("docId") or u,
                        "year":   r.get("year"),
                    })
            elif block["card"] == "evento":
                seen = set()
                for r in rows:
                    u = r.get("uri", "")
                    if u in seen:
                        continue
                    seen.add(u)
                    items.append({
                        "slug":  u.rstrip("/").split("/")[-1],
                        "label": r.get("label") or u,
                        "house": r.get("house"),
                        "place": r.get("place"),
                    })

        related_out.append({
            "title_it":       block["title_it"],
            "card":           block["card"],
            "count":          len(items),
            "count_label_it": block["count_label_it"],
            "placeholder":    block.get("placeholder", False),
            "vals":           items,
        })

    # ── Sezioni (indice) ─────────────────────────────────────────────
    sections = [dict(s) for s in cfg_view.get("sections", [])]

    # ── Titolo / sottotitolo ─────────────────────────────────────────
    if kind == "catalogo":
        title    = _scalar(sc, "title") or doc_id or "Catalogo"
        subtitle = _scalar(sc, "secTitle")
    elif kind == "evento":
        title    = _scalar(sc, "label") or "Asta"
        subtitle = None
    else:
        title, subtitle = "Dettaglio", None

    return {
        "title":      title,
        "subtitle":   subtitle,

        "back": {
            "url":           cfg_view["back"]["url"],
            "label_it":      cfg_view["back"]["label_it"],
            "breadcrumb_it": cfg_view["back"].get("breadcrumb_it", ""),
        },
        
        "has_viewer": cfg_view.get("has_viewer", False),
        "switch":     switch,
        "sections":   sections,
        "fields":     fields,
        "related":    related_out,
    }