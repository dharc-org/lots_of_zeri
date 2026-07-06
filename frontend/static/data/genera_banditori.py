"""
genera_banditori.py — rigenera banditori.json SENZA soglia minima
Fonte: METADATIZERI...xlsx, foglio "Zeri EVENTO ASTA"
Colonne: 9 = BANDITORE, 10 = ORGANIZZATORE (multivalore separato da ||)

Logica:
- all      : tutti i banditori distinti, con totale aste (t) e rel
             (rel = ha almeno una casa d'asta documentata → compare nel grafo)
- top_band : banditori con rel:true, ordinati per t decrescente, poi nome
- case     : tutte le case collegate ad almeno un banditore,
             ordinate per numero totale di eventi nel corpus (decrescente)
- edges    : [idx_top_band, idx_case, n_aste_insieme] — TUTTE le coppie, anche n=1
"""

import json
import openpyxl
from collections import Counter

XLSX = '/mnt/project/METADATIZERI20260527_DEFINITIVO_SOLO_DIGITALIZZATI.xlsx'
OUT  = '/home/claude/banditori.json'

wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
ws = wb['Zeri EVENTO ASTA']
rows = list(ws.iter_rows(min_row=3, values_only=True))   # 2 righe di intestazione

band_totals  = Counter()   # banditore → totale aste documentate
house_totals = Counter()   # casa → totale eventi nel corpus (per l'ordinamento)
pair_counts  = Counter()   # (banditore, casa) → n aste insieme

def split_multi(cell):
    """Valori multipli separati da || (co-banditori / co-organizzatori)."""
    if not cell:
        return []
    return [v.strip() for v in str(cell).split('||') if v.strip()]

for r in rows:
    bands  = split_multi(r[9])    # BANDITORE
    houses = split_multi(r[10])   # ORGANIZZATORE
    for h in houses:
        house_totals[h] += 1
    for b in bands:
        band_totals[b] += 1
        for h in houses:
            pair_counts[(b, h)] += 1

# ── rel: ha almeno una casa documentata (nessuna soglia) ─────────
bands_connected = set(b for (b, h) in pair_counts)

# ── all: tutti i banditori, ordinati per t desc poi nome ─────────
all_list = [
    {'n': b, 't': t, 'rel': b in bands_connected}
    for b, t in sorted(band_totals.items(), key=lambda x: (-x[1], x[0]))
]

# ── top_band: solo i connessi (nodi sinistra del grafo) ──────────
top_band = [
    {'n': e['n'], 't': e['t']}
    for e in all_list if e['rel']
]

# ── case: tutte le case collegate, ordinate per eventi corpus ────
houses_connected = set(h for (b, h) in pair_counts)
case_list = sorted(houses_connected, key=lambda h: (-house_totals[h], h))

# ── edges: tutte le coppie, anche con una sola asta insieme ──────
band_idx = {e['n']: i for i, e in enumerate(top_band)}
case_idx = {h: i for i, h in enumerate(case_list)}
edges = sorted(
    [[band_idx[b], case_idx[h], v] for (b, h), v in pair_counts.items()],
    key=lambda e: (e[0], e[1])
)

out = {
    'all':      all_list,
    'top_band': top_band,
    'case':     case_list,
    'edges':    edges,
}

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f'all: {len(all_list)} banditori '
      f'({sum(1 for e in all_list if e["rel"])} con relazioni)')
print(f'top_band: {len(top_band)} | case: {len(case_list)} | edges: {len(edges)}')
