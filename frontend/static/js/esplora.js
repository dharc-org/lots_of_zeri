/* ══════════════════════════════════════════════════════════
   esplora.js
   Gestisce: tab, heatstrip case d'asta, grafo banditori,
             barre tipologie, mappa D3-geo trend mercato
   ══════════════════════════════════════════════════════════ */

'use strict';

/* ── Percorso base dei JSON statici ────────────────────── */
const DATA_BASE = (window.BASE_PATH || '') + '/api/esplora/';

/* ══════════════════════════════════════════════════════════
   1. SISTEMA TAB
   ══════════════════════════════════════════════════════════ */
(function initTabs() {
  const tabs   = document.querySelectorAll('.expl-tab');
  const panels = document.querySelectorAll('.expl-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab;

      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      panels.forEach(p => p.classList.remove('active'));


      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      document.getElementById('panel-' + id).classList.add('active');


      /* Inizializza il grafico la prima volta che la tab viene aperta */
      if (!tab.dataset.loaded) {
        tab.dataset.loaded = '1';
        initChart(id);
      }
    });
  });

  /* Prima tab attiva subito */
  initChart('case');
  tabs[0].dataset.loaded = '1';
})();

function initChart(id) {
  switch (id) {
    case 'case':      loadAndRenderCase();      break;
    case 'banditori2': loadAndRenderBanditori2(); break;
    case 'tipologie': loadAndRenderTipologie(); break;
    case 'trend':     loadAndRenderTrend();     break;
    case 'stagionalita': loadAndRenderStagionalita(); break;
    case 'geografia':    loadAndRenderGeografia();    break;
    case 'collezioni':   loadAndRenderCollezioni();   break;
  }
}

/* ── Utility fetch JSON ─────────────────────────────────── */
async function fetchJSON(file) {
  const r = await fetch(DATA_BASE + file);
  if (!r.ok) throw new Error('Errore caricamento ' + file);
  return r.json();
}


/* ══════════════════════════════════════════════════════════
   2. CASE D'ASTA — heatstrip temporale
   ══════════════════════════════════════════════════════════ */


async function loadAndRenderCase() {
  const C = await fetchJSON('case_dasta.json');
  const wrap  = document.getElementById('case-rows').closest('.expl-chart-wrap');
  const NS = 'http://www.w3.org/2000/svg';
  const N  = C.ymax - C.ymin + 1;

  /* Svuoto il wrap e imposto struttura a tabella.
     Il limite di larghezza per le celle (preserveAspectRatio="none")
     è gestito via CSS in una fascia di schermo intermedia — vedi
     .case-chart-wrap nel foglio di stile — non qui, per non
     restringere anche i laptop dove la larghezza piena andava bene. */
  wrap.className = 'expl-chart-wrap case-chart-wrap';
  wrap.style.cssText = 'background:var(--paper);border:1px solid var(--gray-1);border-radius:4px;margin-bottom:.75rem;overflow:hidden;';
  wrap.innerHTML = '';

  /* Intestazione fissa */
  const thead = document.createElement('div');
  thead.style.cssText = 'display:grid;grid-template-columns:180px 86px 1fr 80px;gap:10px;align-items:center;padding:8px 1.5rem;background:var(--paper);border-bottom:1px solid var(--gray-1);box-shadow:0 3px 8px rgba(26,20,16,.08);';
  const axisTicks = [1880,1890,1900,1910,1920,1930].map(y =>
    `<text x="${(y - C.ymin) / N * 610}" y="11" fill="var(--ink)" style="font:10.5px var(--ff-mono)">${y}</text>`
  ).join('');
  thead.innerHTML = `
    <div style="font:500 12px var(--ff-body);color:var(--ink);">Casa d'asta</div>
    <div style="font:500 12px var(--ff-body);color:var(--ink);">Sede</div>
    <svg viewBox="0 0 610 14" preserveAspectRatio="none" style="width:100%;height:14px;display:block;">${axisTicks}</svg>
    <div style="font:500 12px var(--ff-body);color:var(--ink);text-align:right;">Aste totali</div>
  `;
  wrap.appendChild(thead);

  /* Corpo scrollabile */
  const tbody = document.createElement('div');
  tbody.style.cssText = 'overflow-y:auto;max-height:65vh;padding:0 1.5rem;background:var(--paper);scrollbar-width:thin;scrollbar-color:var(--gray-1) var(--paper-dark);';
  tbody.style.setProperty('--scrollbar-width', '9px');
  wrap.appendChild(tbody);

  /* Tooltip condiviso */
  const tipEl = document.createElement('div');
  tipEl.style.cssText = 'position:fixed;background:var(--ink);color:var(--paper-light);font:11px var(--ff-mono);padding:3px 7px;border-radius:2px;pointer-events:none;display:none;z-index:2100;white-space:nowrap;';
  document.body.appendChild(tipEl);
  let tipTimer = null;

  function showTip(text, x, y) {
    tipEl.textContent = text;
    tipEl.style.left  = (x + 10) + 'px';
    tipEl.style.top   = (y - 28) + 'px';
    tipEl.style.display = 'block';
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tipEl.style.display = 'none'; }, 2000);
  }

  /* Righe */
  C.houses.forEach(h => {
    const maxV    = Math.max(...Object.values(h.py));
    const hasLink = !!h.uri;   // ⚠️ verifica: il campo si chiama davvero "uri" nel JSON?

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:grid;grid-template-columns:180px 86px 1fr 80px;gap:10px;align-items:center;padding:3px 0;border-top:1px solid rgba(192,175,152,.45);transition:background .1s;cursor:default;background:var(--paper);';
    wrapper.addEventListener('mouseover', () => { wrapper.style.background = 'rgba(217,64,16,.05)'; });
    wrapper.addEventListener('mouseout',  () => { wrapper.style.background = 'var(--paper)'; });

    const svgWrap = document.createElement('div');
    svgWrap.style.cssText = 'position:relative;width:100%;';

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 610 16');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'width:100%;height:16px;display:block;';

    Object.entries(h.py).forEach(([yr, v]) => {
      const x = (+yr - C.ymin) / N * 610;
      const w = Math.max(1, 610 / N - 1.2);
      const o = Math.min(1, .22 + .78 * Math.sqrt(v) / Math.sqrt(maxV));
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', '1');
      rect.setAttribute('width', w);
      rect.setAttribute('height', '14');
      rect.setAttribute('fill', 'var(--terra)');
      rect.setAttribute('fill-opacity', o.toFixed(2));
      rect.style.cursor = 'pointer';
      rect.addEventListener('click', e => {
        e.stopPropagation();
        showTip(`${yr}: ${v} aste`, e.clientX, e.clientY);
      });
      svg.appendChild(rect);
    });

    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', (h.y0 - C.ymin) / N * 610);
    line.setAttribute('y1', '15.5');
    line.setAttribute('x2', (h.y1 - C.ymin + 1) / N * 610);
    line.setAttribute('y2', '15.5');
    line.setAttribute('stroke', 'var(--ink)');
    line.setAttribute('stroke-width', '0.7');
    svg.appendChild(line);

    svgWrap.appendChild(svg);

    const name = h.n.length > 28 ? h.n.slice(0, 27) + '…' : h.n;

    const nameCell = document.createElement('div');
    nameCell.style.cssText = 'font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    nameCell.textContent = name;

    const cityCell = document.createElement('div');
    cityCell.style.cssText = 'font:10.5px var(--ff-mono);color:var(--gray-2);';
    cityCell.textContent = h.city;

    /* Cella totale: link a /aste filtrate per casa d'asta, se disponibile l'URI */
    const totCell = document.createElement('div');
    totCell.style.cssText = 'display:flex;justify-content:flex-end;';

    if (hasLink) {
      const totLink = document.createElement('a');
      totLink.href  = '/aste?organizzatore=' + encodeURIComponent(h.uri);
      totLink.title = `Vedi le aste di ${h.n} in Cerca`;
      totLink.style.cssText =
        'display:flex;align-items:center;gap:3px;font:11px var(--ff-mono);color:var(--terra);' +
        'text-decoration:none;padding:2px 0 2px 4px;transition:padding .15s,color .15s;';
      totLink.innerHTML = h.t + ' <i class="ph ph-arrow-right" style="font-size:11px;transition:transform .15s;"></i>';
      totLink.addEventListener('mouseover', () => {
        totLink.style.paddingLeft  = '0';
        totLink.style.paddingRight = '4px';
        totLink.style.color = 'var(--terra-dark)';
        totLink.querySelector('i').style.transform = 'translateX(3px)';
      });
      totLink.addEventListener('mouseout', () => {
        totLink.style.paddingLeft  = '4px';
        totLink.style.paddingRight = '0';
        totLink.style.color = 'var(--terra)';
        totLink.querySelector('i').style.transform = 'translateX(0)';
      });
      totCell.appendChild(totLink);
    } else {
      totCell.style.cssText += 'font:11px var(--ff-mono);color:var(--terra);';
      totCell.textContent = h.t;
    }

    wrapper.appendChild(nameCell);
    wrapper.appendChild(cityCell);
    wrapper.appendChild(svgWrap);
    wrapper.appendChild(totCell);

    tbody.appendChild(wrapper);
  });
}


async function loadAndRenderGeografia() {
  const G = await fetchJSON('geografia_decenni.json');

  const decades = G.decades.map(d => ({
    label: d.label,
    year: parseInt(d.label, 10),
    top: d.top,
    altre: d.altre,
    resto: d.resto || []
  }));
  decades.push({ ...decades[decades.length - 1], year: 1929 });

  const restoByLabel = {};
  G.decades.forEach(d => { restoByLabel[d.label] = d.resto || []; });

  const allCities = [...new Set(decades.flatMap(d => d.top.map(t => t.n)))];
  const maxVal = G.scale_max;

  /* Colore fisso per città (identità, non posizione in classifica) —
     stessa città = stesso colore in ogni decennio, anche se cambia rango */
  const cityPalette = [
    '#5C0A00', '#380B04', '#A02800', '#6A1905', '#D94010', '#8F3109',
    '#E86040', '#BC540F', '#C87D3E', '#D87F26', '#A07840', '#CE9D58',
    '#7A6050', '#784E3A', '#8F6D56', '#B19C8A', '#DE947C', '#5C4223'
  ];
  const cityColor = {};
  allCities.forEach((city, i) => { cityColor[city] = cityPalette[i % cityPalette.length]; });

  const rowsEl = document.getElementById('geo-rows');
  const gridEl = document.getElementById('geo-gridlines');
  const yearEl = document.getElementById('geo-year');
  const fillEl = document.getElementById('geo-fill');
  const handleEl = document.getElementById('geo-handle');
  const trackEl = document.getElementById('geo-track');
  const ticksEl = document.getElementById('geo-ticks');
  const tickLabelsEl = document.getElementById('geo-ticklabels');
  const playBtn = document.getElementById('geo-play-btn');
  const playIcon = document.getElementById('geo-play-icon');

  rowsEl.innerHTML = '';
  gridEl.innerHTML = '';
  ticksEl.innerHTML = '';
  tickLabelsEl.innerHTML = '';

  [0, .25, .5, .75, 1].forEach(f => {
    const line = document.createElement('span');
    line.style.left = (f * 100) + '%';
    gridEl.appendChild(line);
  });

  G.decades.forEach((d, i) => {
    const frac = i / (G.decades.length - 1) * 100;
    const tick = document.createElement('span');
    tick.style.left = frac + '%';
    ticksEl.appendChild(tick);
    const lbl = document.createElement('span');
    lbl.style.left = frac + '%';
    if (i === 0) lbl.style.transform = 'translateX(0%)';
    if (i === G.decades.length - 1) lbl.style.transform = 'translateX(-100%)';
    lbl.textContent = d.label;
    tickLabelsEl.appendChild(lbl);
  });

  const els = {};
  allCities.forEach(city => {
    const row = document.createElement('div');
    row.className = 'geo-row';
    row.innerHTML = '<span class="geo-row-name"></span><span class="geo-row-bar"></span><a class="geo-row-val"></a>';
    row.querySelector('.geo-row-name').textContent = city;
    rowsEl.appendChild(row);
    els[city] = row;
  });

  const altreRow = document.createElement('div');
  altreRow.className = 'geo-row geo-row--altre';
  altreRow.innerHTML = '<span class="geo-row-name">altre città <span class="geo-altre-arrow">▾</span></span><span class="geo-row-bar"></span><span class="geo-row-val"></span>';
  rowsEl.appendChild(altreRow);

  /* Pannello dettaglio "altre città" — stesso pattern del pannello Altre di Tipologie */
  const altrePanel = document.createElement('div');
  altrePanel.style.cssText = 'display:none;background:var(--paper);border:1px solid var(--gray-1);border-radius:4px;padding:1rem 1.25rem;margin-top:.5rem;';
  const altreTitle = document.createElement('div');
  altreTitle.style.cssText = 'font-family:var(--ff-mono);font-size:.7rem;letter-spacing:.1em;color:var(--gray-3);text-transform:uppercase;margin-bottom:.75rem;padding-bottom:.4rem;border-bottom:1px solid var(--gray-1);';
  altrePanel.appendChild(altreTitle);
  const altreGrid = document.createElement('div');
  altreGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px 2rem;';
  altrePanel.appendChild(altreGrid);
  document.getElementById('geo-rows').closest('.expl-chart-wrap').appendChild(altrePanel);

  let altreOpen = false;
  let currentLabel = decades[0].label;

  function renderAltrePanel(label) {
    const resto = restoByLabel[label] || [];
    altreTitle.textContent = `Le piazze minori del ${label}`;
    altreGrid.innerHTML = '';
    const maxR = resto.length ? resto[0].v : 1;
    resto.forEach(r => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:.5px solid rgba(192,175,152,.3);';
      row.innerHTML = `
        <span style="font-size:12px;color:var(--ink);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.n}</span>
        <div style="width:60px;height:6px;background:var(--paper-dark);border-radius:2px;flex-shrink:0;">
          <div style="width:${Math.round(r.v/maxR*100)}%;height:100%;background:var(--gray-3);border-radius:2px;"></div>
        </div>
        <span style="font-family:var(--ff-mono);font-size:11px;color:var(--gray-3);width:22px;text-align:right;flex-shrink:0;">${r.v}</span>
      `;
      altreGrid.appendChild(row);
    });
  }

  altreRow.addEventListener('click', e => {
    e.stopPropagation();
    altreOpen = !altreOpen;
    altrePanel.style.display = altreOpen ? 'block' : 'none';
    altreRow.querySelector('.geo-altre-arrow').textContent = altreOpen ? '▴' : '▾';
    if (altreOpen) {
      renderAltrePanel(currentLabel);
      setTimeout(() => altrePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  });

  function lerp(a, b, t) { return a + (b - a) * t; }

  function stateAt(pos) {
    pos = Math.max(0, Math.min(1, pos));
    const scaled = pos * (decades.length - 1);
    const i = Math.max(0, Math.min(Math.floor(scaled), decades.length - 2));
    const t = scaled - i;
    const a = decades[i], b = decades[i + 1];
    const values = {};
    allCities.forEach(city => {
      const av = a.top.find(x => x.n === city);
      const bv = b.top.find(x => x.n === city);
      if (av && bv) values[city] = lerp(av.v, bv.v, t);
      else if (av && !bv) values[city] = t < .5 ? av.v : null;
      else if (bv && !av) values[city] = t > .5 ? bv.v : null;
    });
    const altre = lerp(a.altre, b.altre, t);
    return { values, altre, label: t < .5 ? a.label : b.label };
  }

  /* Costruisce l'URL verso i risultati di ricerca filtrati per
     luogo e per l'intervallo di anni del decennio esatto corrente.
     Formato confermato leggendo backend/routers/browse.py
     (_parse_params): i facet "range" come periodo si passano come
     {facet}_from / {facet}_to, i facet "multiselect" come luogo si
     passano come parametro semplice. */
  function decadeEndYear(label) {
    const [startStr, endSuffix] = label.split('–');
    return parseInt(startStr.slice(0, 2) + endSuffix, 10);
  }
  function buildAsteUrl(city, decadeLabel) {
    const startYear = parseInt(decadeLabel.split('–')[0], 10);
    const endYear = decadeEndYear(decadeLabel);
    return `/aste?luogo=${encodeURIComponent(city)}&periodo_from=${startYear}&periodo_to=${endYear}`;
  }

  function render(pos) {
    const { values, altre, label } = stateAt(pos);
    yearEl.textContent = label;
    fillEl.style.width = (pos * 100) + '%';
    handleEl.style.left = (pos * 100) + '%';

    if (label !== currentLabel) {
      currentLabel = label;
      if (altreOpen) renderAltrePanel(currentLabel);
    }

    /* Il numero è collegabile solo quando il cursore è fermo esattamente
       su uno dei punti reali della timeline (non un valore interpolato
       durante il trascinamento) e l'autoplay non sta girando. */
    const scaled = pos * (decades.length - 1);
    const isExactPoint = !timer && Math.abs(scaled - Math.round(scaled)) < 0.001;

    const ranked = Object.entries(values)
      .filter(([, v]) => v !== null && v !== undefined)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    allCities.forEach(city => {
      const idx = ranked.findIndex(r => r[0] === city);
      const row = els[city];
      if (idx === -1) { row.style.opacity = '0'; return; }
      row.style.opacity = '1';
      row.style.top = (idx * 27) + 'px';
      row.querySelector('.geo-row-bar').style.width = Math.round(ranked[idx][1] / maxVal * 100) + '%';
      row.querySelector('.geo-row-bar').style.background = cityColor[city];
      const valEl = row.querySelector('.geo-row-val');
      valEl.textContent = Math.round(ranked[idx][1]);
      if (isExactPoint) {
        valEl.href = buildAsteUrl(city, label);
        valEl.classList.add('geo-row-val--link');
      } else {
        valEl.removeAttribute('href');
        valEl.classList.remove('geo-row-val--link');
      }
    });

    altreRow.style.opacity = '1';
    altreRow.style.top = (10 * 27) + 'px';
    altreRow.querySelector('.geo-row-bar').style.width = Math.round(altre / maxVal * 100) + '%';
    altreRow.querySelector('.geo-row-val').textContent = Math.round(altre);
  }

  let pos = 0, timer = null, dragging = false;

  function stop() {
    cancelAnimationFrame(timer);
    timer = null;
    playIcon.className = 'ph ph-play';
  }

  function play() {
    playIcon.className = 'ph ph-pause';
    let last = performance.now();
    function step(now) {
      const dt = now - last; last = now;
      pos = Math.min(1, pos + dt / 9000);
      render(pos);
      if (pos >= 1) { stop(); render(pos); return; }
      timer = requestAnimationFrame(step);
    }
    timer = requestAnimationFrame(step);
  }

  playBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (timer) { stop(); render(pos); return; }
    if (pos >= 1) pos = 0;
    play();
  });

  function setFromClientX(clientX) {
    const rect = trackEl.getBoundingClientRect();
    pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    render(pos);
  }
  trackEl.addEventListener('pointerdown', e => { e.stopPropagation(); stop(); dragging = true; setFromClientX(e.clientX); });
  window.addEventListener('pointermove', e => { if (dragging) setFromClientX(e.clientX); });
  window.addEventListener('pointerup', () => {
    if (dragging) {
      const N = decades.length - 1;
      const nearestTick = Math.round(pos * N) / N;
      if (Math.abs(pos - nearestTick) < 0.07) {
        pos = nearestTick;
        render(pos);
      }
    }
    dragging = false;
  });

  render(0);
  play();
}


async function loadAndRenderTrend() {
  const [D, world] = await Promise.all([
    fetchJSON('trend_mercato.json'),
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r => r.json())
  ]);

  const chartWrap = document.getElementById('trend-map').closest('.expl-chart-wrap--map');
  const mapEl     = document.getElementById('trend-map');
  let tooltipPinned = false;
  mapEl.addEventListener('click', () => {
    tooltipPinned = false;
    tooltip.style.pointerEvents = 'none';
    tooltip.style.display = 'none';
  });
  const tooltip   = document.getElementById('trend-tooltip');
  const lblFrom   = document.getElementById('tl-from');
  const lblTo     = document.getElementById('tl-to');
  const rangeLbl  = document.getElementById('tl-range-label');
  const trackEl   = document.getElementById('tl-track');
  const playBtn   = document.getElementById('tl-play-btn');
  const playIcon  = document.getElementById('tl-play-icon');
  const zoomInBtn    = document.getElementById('tm-zoom-in');
  const zoomOutBtn   = document.getElementById('tm-zoom-out');
  const zoomResetBtn = document.getElementById('tm-zoom-reset');

  /* ── Larghezza condivisa fra mappa e timeline ─────────────── */
  function contentWidth() {
    const cs = getComputedStyle(chartWrap);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    return chartWrap.clientWidth - padL - padR;
  }

  let W = contentWidth();
  let H = Math.round(W * 0.52);

  mapEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  mapEl.style.height = H + 'px';

  /* ── Proiezione — adattata alle sole città europee, per una
     vista di partenza grande e leggibile. New York e le altre
     transatlantiche restano raggiungibili col pan (vedi sotto). ── */
  const isEurope = c => c.lon > -20;
  const europeCities = D.cities.filter(isEurope);
  const outlierCities = D.cities.filter(c => !isEurope(c));

  const PAD = 24;
  const projection = d3.geoMercator();
  projection.fitExtent(
    [[PAD, PAD], [W - PAD, H - PAD]],
    { type: 'FeatureCollection', features: europeCities.map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })) }
  );

  const path = d3.geoPath().projection(projection);

  /* ── Sfondo terre — "carta antica" ──────────────────────── */
  const countries = topojson
    ? topojson.feature(world, world.objects.countries)
    : { type: 'FeatureCollection', features: [] };

  const g = d3.select(mapEl);
  g.selectAll('*').remove();

  g.append('rect').attr('width', W).attr('height', H).attr('fill', 'var(--paper-dark)');

  const defs = g.append('defs');
  defs.append('pattern')
    .attr('id', 'map-grain')
    .attr('width', 5).attr('height', 5)
    .attr('patternUnits', 'userSpaceOnUse')
    .append('circle')
      .attr('cx', 1).attr('cy', 1).attr('r', .55)
      .attr('fill', 'var(--ink-light)')
      .attr('fill-opacity', .12);

  const clip = defs.append('clipPath').attr('id', 'map-land-clip');
  clip.selectAll('path')
    .data(countries.features)
    .enter().append('path')
    .attr('d', path);

  const zoomLayer = g.append('g').attr('class', 'zoom-layer');

  zoomLayer.selectAll('.country')
    .data(countries.features)
    .enter().append('path')
    .attr('class', 'country')
    .attr('d', path)
    .attr('fill', 'var(--paper)')
    .attr('stroke', 'var(--ink-light)')
    .attr('stroke-opacity', .4)
    .attr('stroke-width', .6)
    .attr('vector-effect', 'non-scaling-stroke');

  zoomLayer.append('rect')
    .attr('width', W).attr('height', H)
    .attr('fill', 'url(#map-grain)')
    .attr('clip-path', 'url(#map-land-clip)');

  /* ── Nomi dei mari — tocco da carta antica, in Playfair corsivo.
     Coordinate scelte su acqua aperta, non su terra. ── */
  const SEAS = [
    { n: 'Oceano Atlantico', lon: -11, lat: 46,   size: 12,   rotate: -18 },
    { n: 'Mare del Nord',    lon: 4,   lat: 55.3, size: 10.5, rotate: -6  },
    { n: 'Mar Mediterraneo', lon: 13,  lat: 37.5, size: 10.5, rotate: -2  }
  ];
  const seasG = zoomLayer.append('g').attr('class', 'sea-labels');
  SEAS.forEach(s => {
    const p = projection([s.lon, s.lat]);
    if (!p) return;
    seasG.append('text')
      .attr('x', p[0]).attr('y', p[1] + (s.n === 'Mar Mediterraneo' ? 12 : 0))
      .attr('text-anchor', 'middle')
      .attr('transform', `rotate(${s.rotate} ${p[0]} ${p[1]})`)
      .attr('font-family', 'var(--ff-head)')
      .attr('font-style', 'italic')
      .attr('font-size', s.size)
      .attr('fill', 'var(--ink-light)')
      .attr('fill-opacity', .38)
      .attr('letter-spacing', '.03em')
      .text(s.n);
  });

  const circlesG = zoomLayer.append('g').attr('class', 'cities');

  /* ── Zoom/pan ─────────────────────────────────────────────
     translateExtent allargato con un margine generoso in ogni
     direzione (non solo verso le città transatlantiche), per
     poter esplorare liberamente anche a nord e a sud dell'area
     inquadrata di default. */
  const VPAD = H * 0.7;
  const HPAD = W * 0.35;
  let extX0 = -HPAD, extY0 = -VPAD, extX1 = W + HPAD, extY1 = H + VPAD;
  outlierCities.forEach(c => {
    const p = projection([c.lon, c.lat]);
    if (!p) return;
    extX0 = Math.min(extX0, p[0] - 70);
    extX1 = Math.max(extX1, p[0] + 70);
  });

  const zoom = d3.zoom()
    .scaleExtent([0.6, 5])
    .translateExtent([[extX0, extY0], [extX1, extY1]])
    .on('zoom', event => { zoomLayer.attr('transform', event.transform); });

  g.call(zoom);
  g.call(zoom.transform, d3.zoomIdentity);

  zoomInBtn.addEventListener('click', e => { e.stopPropagation(); g.transition().duration(200).call(zoom.scaleBy, 1.4); });
  zoomOutBtn.addEventListener('click', e => { e.stopPropagation(); g.transition().duration(200).call(zoom.scaleBy, 1 / 1.4); });
  zoomResetBtn.addEventListener('click', e => { e.stopPropagation(); g.transition().duration(400).call(zoom.transform, d3.zoomIdentity); });

  /* ── Timeline — d3-brush, larghezza = W della mappa ─────── */
  const YMIN = D.ymin, YMAX = D.ymax;
  let yearFrom = YMIN, yearTo = YMAX;

  const xScale = d3.scaleLinear().domain([YMIN, YMAX + 1]).range([0, W]);

  const TRACK_H = 44;
  const trackSvg = d3.select(trackEl)
    .attr('viewBox', `0 0 ${W} ${TRACK_H}`)
    .attr('preserveAspectRatio', 'none')
    .style('width', '100%');

  /* Curva di densità — eventi per anno, sommati su tutte le città */
  const yearCounts = [];
  for (let y = YMIN; y <= YMAX; y++) {
    let c = 0;
    D.cities.forEach(city => { c += (city.py[y] || 0); });
    yearCounts.push({ y, c });
  }
  const maxCount = d3.max(yearCounts, d => d.c) || 1;
  const areaY = d3.scaleLinear().domain([0, maxCount]).range([TRACK_H - 3, 5]);
  const areaGen = d3.area()
    .x(d => xScale(d.y + 0.5)) // centro della colonna dell'anno
    .y0(TRACK_H)
    .y1(d => areaY(d.c))
    .curve(d3.curveMonotoneX);

  const densityD = areaGen(yearCounts);

  trackSvg.append('defs').html(
    `<clipPath id="tl-sel-clip"><rect id="tl-sel-clip-rect" y="0" height="${TRACK_H}" width="0"></rect></clipPath>`
  );

  /* Curva base — sempre visibile, tono neutro caldo: il contesto fisso */
  trackSvg.append('path')
    .attr('class', 'tl-density')
    .attr('d', densityD)
    .attr('fill', 'var(--gray-1)')
    .attr('fill-opacity', .5)
    .attr('stroke', 'var(--gray-2)')
    .attr('stroke-width', 1);

  /* Stessa curva, ritagliata sulla selezione corrente — terracotta pieno */
  trackSvg.append('path')
    .attr('class', 'tl-density-selected')
    .attr('d', densityD)
    .attr('fill', 'var(--terra)')
    .attr('fill-opacity', .55)
    .attr('stroke', 'var(--terra-dark)')
    .attr('stroke-width', 1.5)
    .attr('clip-path', 'url(#tl-sel-clip)');

  const brush = d3.brushX()
    .extent([[0, 0], [W, TRACK_H]])
    .on('brush', brushed)
    .on('end', brushended);

  const brushG = trackSvg.append('g').attr('class', 'tl-brush-g').call(brush);

  brushG.select('.selection')
    .attr('fill', 'none')
    .attr('stroke', 'var(--terra)').attr('stroke-width', 1.5);
  brushG.selectAll('.handle')
    .attr('fill', 'var(--terra)').attr('stroke', 'var(--terra-dark)');
  brushG.select('.overlay').attr('fill', 'transparent');

  brushG.call(brush.move, [xScale(YMIN), xScale(YMAX + 1)]);

  /* Etichette dei decenni sotto la traccia */
  const tickLabelsEl = document.getElementById('tl-ticklabels');
  tickLabelsEl.innerHTML = '';
  for (let y = Math.ceil(YMIN / 10) * 10; y <= YMAX; y += 10) {
    const lbl = document.createElement('span');
    lbl.style.left = xScale(y) + 'px';
    lbl.textContent = y;
    tickLabelsEl.appendChild(lbl);
  }

  function selectionToYears(sel) {
    const y0 = Math.round(xScale.invert(sel[0]));
    const y1raw = Math.round(xScale.invert(sel[1]));
    const y1 = Math.max(y0, y1raw - 1);
    return [Math.max(YMIN, y0), Math.min(YMAX, y1)];
  }

  function brushed(event) {
    if (!event.selection) return;
    if (event.sourceEvent && playing) stopPlay();
    [yearFrom, yearTo] = selectionToYears(event.selection);
    lblFrom.textContent = yearFrom;
    lblTo.textContent   = yearTo;
    const clipRect = document.getElementById('tl-sel-clip-rect');
    clipRect.setAttribute('x', event.selection[0]);
    clipRect.setAttribute('width', event.selection[1] - event.selection[0]);
    updateMap(false);
  }

  function brushended(event) {
    if (!event.selection) return;
    [yearFrom, yearTo] = selectionToYears(event.selection);
    updateMap(true);
  }

  /* ── Autoplay — bordo sinistro ancorato al 1879, si muove solo
     quello destro (non più una finestra di ampiezza fissa che scorre
     come un rettangolo intero) ──────────────────────────────────── */
  const PLAY_DURATION_MS = 14000; // tempo per coprire l'intero periodo
  let playing = false;
  let playTimer = null;
  let playPos = 0; // 0..1, posizione del bordo destro lungo il periodo

  function playStep(now, last) {
    const dt = now - last;
    playPos += dt / PLAY_DURATION_MS;
    if (playPos >= 1) playPos -= 1; // riparte da 1879, in loop continuo

    const winEnd = YMIN + playPos * (YMAX - YMIN + 1);
    brushG.call(brush.move, [xScale(YMIN), xScale(winEnd)]);

    if (playing) playTimer = requestAnimationFrame(n => playStep(n, now));
  }

  function startPlay() {
    playing = true;
    playIcon.className = 'ph ph-pause';
    playBtn.setAttribute('title', 'Ferma autoplay');
    playBtn.setAttribute('aria-label', 'Ferma autoplay');
    rangeLbl.textContent = 'scorrimento automatico';
    playPos = Math.max(0, Math.min(1, (yearTo - YMIN + 1) / (YMAX - YMIN + 1)));
    playTimer = requestAnimationFrame(n => playStep(n, n));
  }

  function stopPlay() {
    playing = false;
    playIcon.className = 'ph ph-play';
    playBtn.setAttribute('title', 'Avvia autoplay');
    playBtn.setAttribute('aria-label', 'Avvia autoplay');
    rangeLbl.textContent = 'trascina per filtrare';
    cancelAnimationFrame(playTimer);
    playTimer = null;
  }

  playBtn.addEventListener('click', e => { e.stopPropagation(); playing ? stopPlay() : startPlay(); });


  /* ── Aggiorna cerchi mappa ──────────────────────────────── */
  function updateMap(animate) {
    const cityTotals = D.cities.map(c => {
      let tot = 0;
      for (let y = yearFrom; y <= yearTo; y++) {
        tot += (c.py[y] || 0);
      }
      return { ...c, visible: tot };
    }).filter(c => c.visible > 0);

    const maxV = Math.max(...cityTotals.map(c => c.visible), 1);
    const rScale = v => Math.max(4, Math.sqrt(v / maxV) * 32);

    const circles = circlesG.selectAll('circle').data(cityTotals, d => d.n);

    const entered = circles.enter().append('circle')
      .attr('cx', d => { const p = projection([d.lon, d.lat]); return p ? p[0] : -9999; })
      .attr('cy', d => { const p = projection([d.lon, d.lat]); return p ? p[1] : -9999; })
      .attr('fill', 'var(--terra)')
      .attr('fill-opacity', .55)
      .attr('stroke', 'var(--terra-dark)')
      .attr('stroke-width', 1)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('r', 0)
      .style('cursor', 'pointer')
      .on('mouseenter', function(event, d) {
        d3.select(this).attr('fill-opacity', .85);
        if (tooltipPinned) return; // un dettaglio è già fissato da un click, non sovrascriverlo con l'anteprima hover
        tooltip.style.pointerEvents = 'none';
        tooltip.style.display = 'block';
        tooltip.innerHTML = `<strong>${d.n}</strong><br>${d.visible} eventi nel periodo selezionato`;
      })
      .on('mousemove', function(event) {
        if (tooltipPinned) return; // il dettaglio fissato non segue più il mouse
        const wrap = mapEl.parentElement.getBoundingClientRect();
        tooltip.style.left = (event.clientX - wrap.left + 10) + 'px';
        tooltip.style.top  = (event.clientY - wrap.top  - 10) + 'px';
      })
      .on('click', function(event, d) {
        event.stopPropagation();
        const wrap = mapEl.parentElement.getBoundingClientRect();
        if (playing) {
          tooltip.style.pointerEvents = 'none';
          tooltip.style.display = 'block';
          tooltip.innerHTML = `<strong>${d.n}</strong><br>Ferma l'autoplay per vedere il dettaglio`;
          tooltip.style.left = (event.clientX - wrap.left + 10) + 'px';
          tooltip.style.top  = (event.clientY - wrap.top  - 10) + 'px';
          return;
        }
        tooltipPinned = true;
        const byYear = [];
        let tot = 0;
        for (let y = yearFrom; y <= yearTo; y++) {
          const v = d.py[y] || 0;
          if (v > 0) { byYear.push(`${y}: ${v} event${v === 1 ? 'o' : 'i'}`); tot += v; }
        }
        const detail = byYear.length ? byYear.join('<br>') : 'nessun evento in questi anni';
        const totUrl = `/aste?luogo=${encodeURIComponent(d.n)}&periodo_from=${yearFrom}&periodo_to=${yearTo}`;
        const totLine = tot > 0
          ? `<a href="${totUrl}" style="color:var(--terra-muted) !important;text-decoration:underline;text-underline-offset:2px;">${tot} evento${tot === 1 ? '' : 'i'} tot${tot === 1 ? 'ale' : 'ali'} →</a><br>`
          : '';
        tooltip.style.pointerEvents = 'auto';
        tooltip.style.display = 'block';
        tooltip.innerHTML = `<strong>${d.n}</strong><br>${totLine}${detail}`;
        tooltip.style.left = (event.clientX - wrap.left + 10) + 'px';
        tooltip.style.top  = (event.clientY - wrap.top  - 10) + 'px';
      })
      .on('mouseleave', function() {
        d3.select(this).attr('fill-opacity', .55);
        if (tooltipPinned) return; // resta visibile: si chiude solo cliccando sullo sfondo della mappa
        tooltip.style.pointerEvents = 'none';
        tooltip.style.display = 'none';
      });

    const merged = entered.merge(circles);
    if (animate) {
      merged.transition().duration(150).attr('r', d => rScale(d.visible));
    } else {
      merged.attr('r', d => rScale(d.visible));
    }

    circles.exit().remove();
  }

  /* ── Ridimensionamento finestra ─────────────────────────── */
  window.addEventListener('resize', () => {
    W = contentWidth();
    H = Math.round(W * 0.52);
    mapEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    mapEl.style.height = H + 'px';
    xScale.range([0, W]);
    trackSvg.attr('viewBox', `0 0 ${W} ${TRACK_H}`);
    trackSvg.select('.tl-density').attr('d', areaGen(yearCounts));
    trackSvg.select('.tl-density-selected').attr('d', areaGen(yearCounts));
    brush.extent([[0, 0], [W, TRACK_H]]);
    brushG.call(brush);
    brushG.call(brush.move, [xScale(yearFrom), xScale(yearTo + 1)]);
    tickLabelsEl.innerHTML = '';
    for (let y = Math.ceil(YMIN / 10) * 10; y <= YMAX; y += 10) {
      const lbl = document.createElement('span');
      lbl.style.left = xScale(y) + 'px';
      lbl.textContent = y;
      tickLabelsEl.appendChild(lbl);
    }
    /* la proiezione/zoom della mappa non viene ricalcolata al resize,
       per non perdere la posizione di navigazione dell'utente */
  });

  /* Avvio */
  lblFrom.textContent = yearFrom;
  lblTo.textContent   = yearTo;
  updateMap(false);

  startPlay();
}



/* ── Carica topojson se necessario ──────────────────────── */
if (typeof topojson === 'undefined') {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';
  s.onload = () => { /* topojson ora disponibile */ };
  document.head.appendChild(s);
}


async function loadAndRenderStagionalita() {
  const S = await fetchJSON('stagionalita.json');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('stag-svg');
  const legendEl = document.getElementById('stag-legend');
  const infoBtn = document.getElementById('stag-info-btn');
  const infoPopover = document.getElementById('stag-info-popover');
  svg.innerHTML = '';

const STYLE = {
  'Germania':               { stroke: '#5C0A00', dash: null,          label: 'Germania' },
  'Francia':                { stroke: '#D94010', dash: '6,3',         label: 'Francia'  },
  'Italia':                 { stroke: '#A07840', dash: '1.5,2.5',     label: 'Italia'   },
  'Inghilterra':            { stroke: '#E86040', dash: '4,2,1,2',     label: 'Inghilterra' },
  'Paesi Bassi':            { stroke: '#C87D3E', dash: '8,3,2,3',     label: 'Paesi Bassi' },
  "Stati Uniti d'America":  { stroke: '#7A6050', dash: '2,2',         label: "Stati Uniti d'America" }
};

  const pathsByCountry = {};

  legendEl.style.cssText = 'display:flex;justify-content:center;gap:16px;font-family:var(--ff-mono);font-size:11.5px;flex-wrap:wrap;';
  legendEl.innerHTML = '';
  S.countries.forEach(c => {
    const st = STYLE[c.n] || { stroke: 'var(--gray-3)', dash: null };
    const dashAttr = st.dash ? ` stroke-dasharray="${st.dash}"` : '';
    const item = document.createElement('span');
    item.style.cssText = `display:flex;align-items:center;gap:5px;color:${st.stroke};cursor:pointer;`;
    item.innerHTML = `<svg width="14" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke="${st.stroke}" stroke-width="2"${dashAttr}/></svg>${c.n} — ${c.tot.toLocaleString('it-IT')} aste`;
    legendEl.appendChild(item);

    /* Enfasi al passaggio del mouse: la linea del paese selezionato
       si accende, le altre sfumano — restano tutte nello stesso
       grafico (sempre confrontabili), ma senza competere insieme
       per l'attenzione. */
    item.addEventListener('mouseenter', () => {
      Object.entries(pathsByCountry).forEach(([name, g]) => {
        const active = name === c.n;
        g.path.style.opacity = active ? '1' : '0.12';
        g.path.style.strokeWidth = active ? '2.5' : '1.5';
        g.dots.forEach(d => { d.style.opacity = active ? '1' : '0.12'; });
      });
    });
    item.addEventListener('mouseleave', () => {
      Object.values(pathsByCountry).forEach(g => {
        g.path.style.opacity = '1';
        g.path.style.strokeWidth = '1.5';
        g.dots.forEach(d => { d.style.opacity = '1'; });
      });
    });
  });

  const de = S.countries.find(c => c.n === 'Germania') || S.countries[0];
  const idxOtt = S.months.indexOf('ott');
  infoPopover.textContent = `Ogni punto è la quota percentuale di un mese sul totale annuo del paese — non sul totale complessivo di tutti i paesi. Esempio: ${de.n}, ${S.months[idxOtt]}: ${de.m[idxOtt]} ÷ ${de.tot} = ${(de.m[idxOtt]/de.tot*100).toFixed(1).replace('.', ',')}%`;

  infoBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = infoPopover.classList.toggle('is-open');
    infoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', e => {
    if (!infoBtn.contains(e.target) && !infoPopover.contains(e.target)) {
      infoPopover.classList.remove('is-open');
      infoBtn.setAttribute('aria-expanded', 'false');
    }
  });

  const W = 600, H = 250, PL = 44, PR = 10, PT = 20, PB = 56;
  const CW = W - PL - PR, CH = H - PT - PB;
  const N = S.months.length;
  const x = i => PL + i * (CW / (N - 1));

  const allPct = S.countries.flatMap(c => c.m.map(v => v / c.tot * 100));
  const yMax = Math.ceil(Math.max(...allPct) / 10) * 10;
  const y = v => PT + CH - (v / yMax * CH);

  function mkEl(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    svg.appendChild(e);
    return e;
  }

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  for (let g = 0; g <= yMax; g += 10) {
    mkEl('line', { x1: PL, y1: y(g), x2: PL + CW, y2: y(g), stroke: g === 0 ? 'var(--ink)' : 'var(--gray-1)', 'stroke-width': g === 0 ? 1 : 1 });
    const t = mkEl('text', { x: PL - 4, y: y(g) + 3, 'text-anchor': 'end', fill: 'var(--gray-2)', style: 'font:10px var(--ff-mono)' });
    t.textContent = g + '%';
  }

  let tip = document.getElementById('stag-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'stag-tooltip';
    tip.style.cssText = 'position:fixed;background:var(--ink);color:var(--paper-light);font:11px var(--ff-mono);padding:4px 8px;border-radius:2px;pointer-events:none;display:none;z-index:2100;white-space:nowrap;';
    document.body.appendChild(tip);
  }

  S.countries.forEach(c => {
    const st = STYLE[c.n] || { stroke: 'var(--gray-3)', dash: null };
    const d = c.m.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v / c.tot * 100).toFixed(1)}`).join(' ');
    const pathAttrs = { d, fill: 'none', stroke: st.stroke, 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
    if (st.dash) pathAttrs['stroke-dasharray'] = st.dash;
    const path = mkEl('path', pathAttrs);
    const dots = [];
    pathsByCountry[c.n] = { path, dots };

    c.m.forEach((v, i) => {
      const pct = v / c.tot * 100;
      const dot = mkEl('circle', { cx: x(i), cy: y(pct), r: 3.5, fill: st.stroke, style: 'cursor:pointer' });
      dots.push(dot);
      dot.addEventListener('mousemove', e => {
        tip.style.display = 'block';
        tip.style.left = (e.clientX + 10) + 'px';
        tip.style.top = (e.clientY - 28) + 'px';
        tip.textContent = `${c.n}, ${S.months[i]}: ${v} di ${c.tot} aste = ${pct.toFixed(1).replace('.', ',')}%`;
      });
      dot.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
  });

S.months.forEach((m, i) => {
  const t = mkEl('text', { x: x(i), y: H - PB + 14, 'text-anchor': 'middle', fill: 'var(--gray-2)', style: 'font:10px var(--ff-mono)' });
  t.textContent = m;
});

/* Etichetta asse X */
const xLbl = mkEl('text', { x: PL + CW / 2, y: H - 6, 'text-anchor': 'middle', fill: 'var(--gray-2)', style: 'font:9px var(--ff-mono)' });
xLbl.textContent = 'Mese dell\'anno';

/* Etichetta asse Y (ruotata) */
const yLbl = mkEl('text', { x: 12, y: PT + CH / 2, 'text-anchor': 'middle', fill: 'var(--gray-2)', style: 'font:8px var(--ff-mono)', transform: `rotate(-90,12,${PT + CH / 2})` });
yLbl.textContent = 'Aste del mese, % sul totale annuo del paese';
}


async function loadAndRenderBanditori2() {
  const B  = await fetchJSON('banditori.json');

  /* Ordina i banditori per numero di aste (decrescente) e rimappa gli indici degli archi */
  {
    const order = B.top_band.map((_, i) => i)
                    .sort((i, j) => B.top_band[j].t - B.top_band[i].t);
    const oldToNew = new Array(order.length);
    order.forEach((oldIdx, newIdx) => { oldToNew[oldIdx] = newIdx; });
    B.top_band = order.map(i => B.top_band[i]);
    B.edges = B.edges.map(([a, b, n]) => [oldToNew[a], b, n]);
  }

  const NS = 'http://www.w3.org/2000/svg';
  const wrap  = document.getElementById('band-wrap2');

  wrap.style.cssText = 'background:var(--paper);border:1px solid var(--gray-1);border-radius:4px;margin-bottom:.75rem;overflow:hidden;';

  /* Intestazione fissa */
  const thead = document.createElement('div');
  thead.style.cssText = 'display:grid;grid-template-columns:260px 1fr;border-bottom:1px solid var(--gray-1);box-shadow:0 3px 8px rgba(26,20,16,.08);background:var(--paper);';

  const thLeft = document.createElement('div');
  thLeft.style.cssText = 'padding:.75rem 1rem;border-right:1px solid var(--gray-1);display:flex;flex-direction:column;justify-content:center;';
  const nRel = B.all.filter(b => b.status === 'relazionato').length;
thLeft.innerHTML = `
  <div style="font-family:var(--ff-body);font-size:.8rem;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--gray-3);">${B.all.length} banditori</div>
  <div id="band2-legend-toggle" style="display:flex;align-items:center;gap:3px;cursor:pointer;font-family:var(--ff-mono);font-size:.78rem;color:var(--gray-2);margin-top:.15rem;">
    Legenda <i class="ph ph-caret-down" id="band2-legend-caret" style="font-size:.65rem;transition:transform .15s;"></i>
  </div>
  <div id="band2-legend-items" style="display:none;gap:9px;flex-wrap:wrap;margin-top:.4rem;font-family:var(--ff-mono);font-size:.62rem;color:var(--gray-2);">
    <span style="display:inline-flex;align-items:center;gap:3px;"><span style="width:6px;height:6px;border-radius:50%;background:var(--terra);display:inline-block;"></span>Con casa d'asta nota</span>
    <span style="display:inline-flex;align-items:center;gap:3px;"><span style="width:6px;height:6px;border-radius:50%;border:1.2px solid var(--terra);display:inline-block;"></span>Senza casa d'asta — verosimilmente in proprio</span>
  </div>
`;

const band2LegendToggle = thLeft.querySelector('#band2-legend-toggle');
const band2LegendItems  = thLeft.querySelector('#band2-legend-items');
const band2LegendCaret  = thLeft.querySelector('#band2-legend-caret');
band2LegendToggle.addEventListener('click', e => {
  e.stopPropagation();
  const isOpen = band2LegendItems.style.display === 'flex';
  band2LegendItems.style.display = isOpen ? 'none' : 'flex';
  band2LegendCaret.style.transform = isOpen ? '' : 'rotate(180deg)';
});

  const thRight = document.createElement('div');
  thRight.style.cssText = 'padding:.75rem 1rem;display:flex;justify-content:space-between;align-items:flex-start;';
  thRight.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;gap:.4rem;">
        <div style="font-family:var(--ff-body);font-size:.8rem;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--gray-3);">Relazioni banditori — case d'asta</div>
        <div id="band-info-btn2" style="width:15px;height:15px;border-radius:50%;border:1.5px solid var(--gray-2);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-family:var(--ff-mono);font-size:.62rem;color:var(--gray-2);position:relative;" title="Come funziona">i
          <div id="band-info-tooltip2" style="display:none;position:absolute;top:calc(100% + 6px);left:0;background:var(--ink);color:var(--paper-light);font-family:var(--ff-body);font-size:.75rem;line-height:1.55;padding:.6rem .85rem;border-radius:3px;width:260px;z-index:50;pointer-events:none;">Clicca un nome nella lista o un nodo nel grafico per isolare i legami. Clicca di nuovo per tornare alla vista completa. Di default nessun arco è visibile.</div>
        </div>
      </div>
      <div style="font-family:var(--ff-mono);font-size:.78rem;color:var(--gray-2);margin-top:.15rem;" id="band-hint2">Clicca un nome nella lista per evidenziarne i legami</div>
    </div>
    <div style="font-family:var(--ff-body);font-size:.8rem;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--gray-3);">Case d'asta</div>
  `;

  thead.appendChild(thLeft);
  thead.appendChild(thRight);
  wrap.appendChild(thead);

  /* Corpo */
  const tbody = document.createElement('div');
  tbody.style.cssText = 'display:grid;grid-template-columns:260px 1fr;';
  wrap.appendChild(tbody);

  /* Lista scrollabile */
  const listBody = document.createElement('div');
  listBody.style.cssText = 'overflow-y:auto;height:900px;max-height:900px;border-right:1px solid var(--gray-1);scrollbar-width:thin;scrollbar-color:var(--gray-1) var(--paper-dark);';
  tbody.appendChild(listBody);

  let selBand = null;
  const rows = [];
  const hint = document.getElementById('band-hint2');

  /* Simbolo di stato per riga: pieno = relazionato, contorno = senza casa
     d'asta (auto-organizzato o non documentato — trattate come un'unica
     categoria, "verosimilmente in proprio") */
  function dotHtml(status) {
    if (status === 'relazionato') return '<span style="width:7px;height:7px;border-radius:50%;background:var(--terra);display:inline-block;"></span>';
    return '<span style="width:7px;height:7px;border-radius:50%;border:1.3px solid var(--terra);display:inline-block;"></span>';
  }

  B.all.forEach(b => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:14px 1fr auto;gap:6px;padding:5px 10px;border-bottom:0.5px solid rgba(192,175,152,.35);cursor:pointer;align-items:center;transition:background .1s;background:var(--paper);';
    const nameColor = 'var(--ink)';
    row._nameColor = nameColor;
    row.innerHTML = `
      ${dotHtml(b.status)}
      <span class="band-name" style="font-size:.78rem;color:${nameColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${b.n}">${b.n}</span>
      <span style="font-family:var(--ff-mono);font-size:.7rem;color:var(--gray-2);">${b.t}</span>
    `;
    row.addEventListener('mouseover', () => { if(!row.dataset.sel) row.style.background='rgba(217,64,16,.05)'; });
    row.addEventListener('mouseout',  () => { if(!row.dataset.sel) row.style.background='var(--paper)'; });
    row.addEventListener('click', e => {
      e.stopPropagation();
      /* secondo click → reset */
      if (row.dataset.sel) {
        selBand = null;
        resetLista();
        render();
        return;
      }

      resetLista();
      row.style.background='rgba(217,64,16,.1)';
      row.dataset.sel='1';
      row.querySelector('.band-name').style.color='var(--terra)';

      if (b.status === 'relazionato') {
        const topIdx = B.top_band.findIndex(tb => tb.n === b.n);
        selBand = topIdx;
        hint.style.color='var(--terra)'; hint.textContent = b.n + ' — ' + b.t + ' aste documentate';
        /* Porta il nodo selezionato in vista nel grafo scrollabile */
        const scale = svg.clientWidth / 460;
        grafDiv.scrollTo({ top: Math.max(0, ly(topIdx) * scale - grafDiv.clientHeight / 2), behavior: 'smooth' });
      } else if (b.status === 'autorganizzato') {
        selBand = -2;
        hint.style.color='var(--terra)';
        hint.innerHTML = b.n + ' — ' + b.t + (b.t===1?' asta':' aste') + ' documentate. Non ci sono relazioni attive: l\'attività è auto-organizzata.';
      } else {
        selBand = -3;
        hint.style.color='var(--terra)';
        hint.innerHTML = b.n + ' — ' + b.t + (b.t===1?' asta':' aste') + ' documentate. Dato non documentato nel <em>corpus</em>.';
      }
      render();
    });
    listBody.appendChild(row);
    rows.push(row);
  });

  /* Grafico — scrollabile, altezza SVG proporzionale al numero di nodi */
  const grafDiv = document.createElement('div');
  grafDiv.style.cssText = 'padding:.75rem 1rem;background:var(--paper);overflow-y:auto;max-height:900px;scrollbar-width:thin;scrollbar-color:var(--gray-1) var(--paper-dark);';
  tbody.appendChild(grafDiv);

  /* SVG bipartito */
  const maxT   = Math.max(...B.top_band.map(b => b.t), 1);
  const rBand  = t => 3 + Math.sqrt(t / maxT) * 9;   // raggio tra 3 e 12, proporzionale all'attività
  const T0 = 20;

  /* Spaziatura verticale dinamica: la distanza tra due nodi consecutivi
     è sempre almeno la somma dei loro raggi (+ margine) — altrimenti i
     nodi più grandi si sovrappongono a quelli immediatamente sotto */
  const PAD = 4;
  const rArr = B.top_band.map(b => rBand(b.t));
  const yBand = [T0 + rArr[0]];
  for (let i = 1; i < rArr.length; i++) {
    yBand.push(yBand[i-1] + rArr[i-1] + rArr[i] + PAD);
  }
  const T1 = yBand[yBand.length - 1] || T0;
  const H  = T1 + (rArr[rArr.length-1] || 0) + 30;
  const LX = 145, RX = 285;
  const ly = i => yBand[i];
  const ry = i => T0 + i*(T1-T0)/Math.max(B.case.length-1,1);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 460 ${H}`);
  svg.style.cssText = 'width:100%;display:block;';
  grafDiv.appendChild(svg);
  const eEls=[], lEls=[], rEls=[];

  function svgEl(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for(const k in attrs) e.setAttribute(k, attrs[k]);
    svg.appendChild(e);
    return e;
  }

  /* Archi — SPOTLIGHT: invisibili di default, visibili solo su selezione.
     L'etichetta con il numero di eventi compare accanto alla casa d'asta
     di destinazione, solo per le relazioni del banditore selezionato. */
  B.edges.forEach(([a,b,n]) => {
    const y1=ly(a), y2=ry(b), mx=(LX+RX)/2;
    const x0 = LX+rBand(B.top_band[a].t)+2, x3 = RX-5;
    const p = svgEl('path', {
      d: `M ${x0} ${y1} C ${mx} ${y1},${mx} ${y2},${x3} ${y2}`,
      fill:'none', stroke:'var(--terra)',
      'stroke-width': Math.max(1.5, Math.sqrt(n)*.9),
      'stroke-opacity':'0', 'stroke-linecap':'round'
    });
    const lbl = svgEl('text', {x:RX+9, y:y2+15, 'text-anchor':'start', fill:'var(--terra-dark)', opacity:'0'});
    lbl.style.font = '600 8px var(--ff-mono)';
    lbl.textContent = n + (n===1 ? ' evento asta condotto qui' : ' eventi asta condotti qui');
    eEls.push({p,lbl,a,b:b,n});
  });

  /* Funzione reset lista */
  function resetLista() {
    rows.forEach(r => {
      r.style.background = 'var(--paper)';
      delete r.dataset.sel;
      r.querySelector('.band-name').style.color = r._nameColor;
    });
    hint.style.color='var(--gray-2)'; hint.textContent = 'Clicca un nome nella lista per evidenziarne i legami';
  }

  B.top_band.forEach((band,i) => {
    const y=ly(i);
    const r=rBand(band.t);
    const c=svgEl('circle',{cx:LX,cy:y,r:r,fill:'var(--terra)','fill-opacity':'.6',stroke:'var(--terra-dark)','stroke-width':'1',style:'cursor:pointer'});
    const t=svgEl('text',{x:LX-r-8,y:y+4,'text-anchor':'end',fill:'var(--ink)'});
    t.style.font='9px var(--ff-body)';
    t.style.cursor='pointer';
    t.textContent = band.n.length>28 ? band.n.slice(0,27)+'…' : band.n;

    /* Click sul nodo → seleziona e rispecchia in lista */
    [c,t].forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      if (selBand === i) {
        /* secondo click → reset */
        selBand = null;
        resetLista();
      } else {
        selBand = i;
        resetLista();
        /* evidenzia riga corrispondente nella lista */
        const row = rows.find(r => r.querySelector('.band-name').title === band.n);
        if (row) {
          row.style.background = 'rgba(217,64,16,.1)';
          row.dataset.sel = '1';
          row.querySelector('.band-name').style.color = 'var(--terra)';
          row.scrollIntoView({ block: 'nearest' });
        }
        hint.style.color='var(--terra)'; hint.textContent = band.n + ' — ' + band.t + ' aste documentate';
      }
      render();
    }));

    lEls.push({c,t});
  });

  B.case.forEach((name,i) => {
    const y=ry(i);
    const c=svgEl('circle',{cx:RX,cy:y,r:5,fill:'var(--paper-light)',stroke:'var(--ink)','stroke-width':'1.2'});
    const t=svgEl('text',{x:RX+9,y:y+4,fill:'var(--ink)'});
    t.style.font='9px var(--ff-body)';
    t.textContent = name.length>22 ? name.slice(0,21)+'…' : name;
    rEls.push({c,t});
  });

  /* Click sull'SVG in area vuota → reset */
  svg.addEventListener('click', e => {
    e.stopPropagation();
    if (e.target === svg) {
      selBand = null;
      resetLista();
      render();
    }
  });

  /* SPOTLIGHT: opacità arco 0 quando non selezionato, .8 (+ etichetta) solo sull'arco scelto */
  function render() {
    eEls.forEach(e => {
      const on = selBand!==null && selBand===e.a;
      e.p.setAttribute('stroke-opacity', on ? '.8' : '0');
      e.lbl.setAttribute('opacity', on ? '1' : '0');
    });
    lEls.forEach((n,i) => {
      const on = selBand===null || selBand===i;
      [n.c,n.t].forEach(x=>x.setAttribute('opacity',on?1:.3));
    });
    rEls.forEach((n,i) => {
      const on = selBand===null || eEls.some(e=>e.a===selBand&&e.b===i);
      [n.c,n.t].forEach(x=>x.setAttribute('opacity',on?1:.2));
    });
  }

  /* Pulsante info interazione */
  const infoBtn2 = document.getElementById('band-info-btn2');
  const infoTip2 = document.getElementById('band-info-tooltip2');
  if (infoBtn2 && infoTip2) {
    infoBtn2.addEventListener('click', e => {
      e.stopPropagation();
      infoTip2.style.display = infoTip2.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', () => { infoTip2.style.display = 'none'; });
  }

  render();

  /* Breve tour dimostrativo, una tantum al caricamento: mostra i
     primi nodi del grafo (i banditori più attivi, fino a Couturier
     André se presente), poi torna alla vista libera. */
  const couturierIdx = B.top_band.findIndex(b => b.n === 'Couturier, André');
  const tourEnd = couturierIdx >= 0 ? couturierIdx + 1 : 3;
  const reps = B.top_band.slice(0, tourEnd);
  if (reps.length) {
    reps.forEach((b, i) => {
      setTimeout(() => {
        const row = rows.find(r => r.querySelector('.band-name').title === b.n);
        if (row) row.click();
      }, 900 + i * 2200);
    });

    setTimeout(() => {
      selBand = null;
      resetLista();
      render();
    }, 900 + reps.length * 2200);
  }
}


async function loadAndRenderCollezioni() {
  const C = await fetchJSON('collezioni.json');
  const legendEl = document.getElementById('coll-legend');
  const listEl = document.getElementById('coll-list');
  legendEl.innerHTML = '';
  listEl.innerHTML = '';

  const TAG_COLOR = {
    anno:    { bg: '#D94010' },
    casa:    { bg: '#C87D3E' },
    diverse: { bg: '#5C0A00' }
  };
  const DISPLAY_LABEL = {
    anno:    'stesso anno',
    casa:    "stessa casa d'asta",
    diverse: "case d'asta diverse"
  };
  Object.entries(DISPLAY_LABEL).forEach(([tag, label]) => {
    const dot = document.createElement('span');
    dot.style.cssText = 'display:flex;align-items:center;gap:4px;';
    dot.innerHTML = `<span style="width:9px;height:9px;border-radius:50%;background:${TAG_COLOR[tag].bg};display:inline-block;"></span>${label}`;
    legendEl.appendChild(dot);
  });

  const collInfoBtn = document.getElementById('coll-info-btn');
  const collInfoPopover = document.getElementById('coll-info-popover');
  if (collInfoBtn && collInfoPopover) {
    collInfoPopover.textContent = 'Il colore del pallino indica come si distribuiscono le ricomparse di una collezione: terracotta pieno = stesso anno, probabile unica vendita in più sessioni; ocra = stessa casa d\'asta su anni diversi, probabile liquidazione a tranche; marrone scuro = anni e case d\'asta diverse, dispersione reale sul mercato. Un secondo pallino marrone segnala, accanto a «stesso anno», collezioni vendute in un solo anno ma presso più case d\'asta.';
    collInfoBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = collInfoPopover.classList.toggle('is-open');
      collInfoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', e => {
      if (!collInfoBtn.contains(e.target) && !collInfoPopover.contains(e.target)) {
        collInfoPopover.classList.remove('is-open');
        collInfoBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  C.items.forEach(item => {
    const pct = (item.c / C.max * 100).toFixed(1);
    const tc = TAG_COLOR[item.tag];
    const realHouses = item.case.filter(h => h.n !== 'non specificata');
    const showSecondary = item.tag === 'anno' && realHouses.length > 1;

    const barBg = showSecondary
      ? `linear-gradient(to right, ${tc.bg}, ${TAG_COLOR.diverse.bg})`
      : tc.bg;

    const row = document.createElement('div');
    row.style.cssText = 'cursor:pointer;padding:3px 4px;border-radius:3px;';
    row.innerHTML = `
      <div style="display:grid;grid-template-columns:150px 32px 1fr 20px;align-items:center;gap:8px;">
        <span style="font-size:12px;color:var(--ink);">${item.n}</span>
        <span style="display:flex;gap:3px;align-items:center;">
          <span style="width:9px;height:9px;border-radius:50%;background:${tc.bg};display:inline-block;" title="${DISPLAY_LABEL[item.tag]}"></span>
          ${showSecondary ? `<span style="width:9px;height:9px;border-radius:50%;background:${TAG_COLOR.diverse.bg};display:inline-block;" title="Coinvolte anche più case d'asta diverse"></span>` : ''}
        </span>
        <span style="height:12px;background:${barBg};border-radius:2px;width:${pct}%;"></span>
        <span style="font-family:var(--ff-mono);font-size:11px;color:var(--ink);">${item.c}</span>
      </div>
    `;

    const detail = document.createElement('div');
    detail.style.cssText = 'display:none;margin:4px 0;padding:6px 10px;background:var(--paper-dark);border-radius:3px;font-family:var(--ff-mono);font-size:10.5px;color:var(--ink);line-height:1.6;';
    const houses = item.case.map(h => `${h.n} (${h.v})`).join(', ');
    /* Link alle aste specifiche in cui è comparsa questa collezione.
       Compare solo se il JSON ha un URI reale (item.uri) — finché non
       arriva la mappatura nome→URI dal backend, resta testo semplice
       invece di un link che porterebbe sempre a zero risultati. */
    const collLink = item.uri
      ? `<br><a href="/aste?collezione=${encodeURIComponent(item.uri)}" style="color:var(--terra-muted) !important;text-decoration:underline;text-underline-offset:2px;">Vedi l'asta relativa <i class="ph ph-arrow-right"></i></a>`
      : '';
    detail.innerHTML = `<strong>Periodo:</strong> ${item.periodo}<br><strong>Case d'asta coinvolte:</strong> ${houses}` +
      (showSecondary ? `<br><span style="color:#5C0A00;">tutti gli eventi nello stesso anno, ma distribuiti su ${realHouses.length} case d'asta diverse</span>` : '') +
      collLink;

    row.addEventListener('click', e => {
      e.stopPropagation();
      const open = detail.style.display === 'block';
      listEl.querySelectorAll('[data-detail]').forEach(el => { el.style.display = 'none'; });
      detail.style.display = open ? 'none' : 'block';
    });
    detail.setAttribute('data-detail', '1');

    listEl.appendChild(row);
    listEl.appendChild(detail);
  });
}


async function loadAndRenderTipologie() {
  const T     = await fetchJSON('tipologie_oggetti.json');
  const svgEl = document.getElementById('tip-svg');
  const chips = document.getElementById('tip-chips');
  const NS    = 'http://www.w3.org/2000/svg';

  /* Palette 1 — Terra bruciata */
  const CL = {
    'DIPINTI':    '#5C0A00',
    'MOBILI':     '#A02800',
    'DISEGNI':    '#D94010',
    'ACQUERELLI': '#E86040',
    'PORCELLANE': '#C87D3E',
    'STAMPE':     '#A07840',
    'ALTRE':      '#7A6050',
  };

  const W=660, H=280, PL=44, PR=6, PB=38, PT=14;
  const CW=W-PL-PR, CH=H-PB-PT;
  const N=T.m.length, bw=CW/N;
  let mode = -1;
  let altreOpen = false;

  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

  function mkEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    (parent || svgEl).appendChild(e);
    return e;
  }
  function lbl(c) { return c.charAt(0) + c.slice(1).toLowerCase(); }

  /* Tooltip */
  const tip = document.createElement('div');
  tip.style.cssText = 'position:fixed;background:var(--ink);color:var(--paper-light);font:11px var(--ff-mono);padding:4px 8px;border-radius:2px;pointer-events:none;display:none;z-index:2100;white-space:nowrap;line-height:1.6;';
  document.body.appendChild(tip);

  /* Pannello Altre */
  const altrePanel = document.createElement('div');
  altrePanel.style.cssText = 'display:none;background:var(--paper);border:1px solid var(--gray-1);border-radius:4px;padding:1rem 1.25rem;margin-top:.5rem;';

  const altreTitle = document.createElement('div');
  altreTitle.style.cssText = 'font-family:var(--ff-mono);font-size:.7rem;letter-spacing:.1em;color:var(--gray-3);text-transform:uppercase;margin-bottom:.75rem;padding-bottom:.4rem;border-bottom:1px solid var(--gray-1);';
  altreTitle.textContent = 'Il resto degli oggetti all\'incanto';
  altrePanel.appendChild(altreTitle);

  const altreGrid = document.createElement('div');
  altreGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px 2rem;';
  const maxAV = T.altre_voci[0][1];
  T.altre_voci.forEach(([nome, cnt]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:.5px solid rgba(192,175,152,.3);';
    row.innerHTML = `
      <span style="font-size:12px;color:var(--ink);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nome.charAt(0)+nome.slice(1).toLowerCase()}</span>
      <div style="width:60px;height:6px;background:var(--paper-dark);border-radius:2px;flex-shrink:0;">
        <div style="width:${Math.round(cnt/maxAV*100)}%;height:100%;background:var(--gray-3);border-radius:2px;"></div>
      </div>
      <span style="font-family:var(--ff-mono);font-size:11px;color:var(--gray-3);width:28px;text-align:right;flex-shrink:0;">${cnt}</span>
    `;
    altreGrid.appendChild(row);
  });
  altrePanel.appendChild(altreGrid);

  /* Inserisco il pannello dopo il chart-wrap */
  const chartWrap = document.getElementById('tip-svg').closest('.expl-chart-wrap');
  chartWrap.appendChild(altrePanel);

  /* Chips */
  const allBtn = makeChip('Tutte', null, -1);
  chips.appendChild(allBtn);
  const catBtns = T.cats.map((c, i) => {
    const b = makeChip(lbl(c) + ' · ' + T.tot[c], CL[c], i);
    chips.appendChild(b);
    return b;
  });

  function makeChip(label, color, idx) {
    const b = document.createElement('button');
    const isAltre = T.cats[idx] === 'ALTRE';
    b.className = isAltre ? 'expl-chip expl-chip--altre' : 'expl-chip';
    b.innerHTML = isAltre ? label + ' <span class="chip-arrow"><i class="ph ph-caret-down"></i></span>' : label;
    b.style.color = color || 'var(--ink)';
    b.style.borderColor = color || 'var(--ink)';
    b.addEventListener('click', e => {
      e.stopPropagation();
      if (isAltre) {
        altreOpen = !altreOpen;
        altrePanel.style.display = altreOpen ? 'block' : 'none';
        if (altreOpen) { setTimeout(() => altrePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50); }
        if (altreOpen) { setTimeout(() => altrePanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
        b.style.background  = altreOpen ? color : 'none';
        b.style.color       = altreOpen ? 'var(--paper-light)' : color;
        b.querySelector('.chip-arrow i').className = altreOpen ? 'ph ph-caret-up' : 'ph ph-caret-down';
      }
      mode = (mode === idx && !isAltre) ? -1 : idx;
      render();
    });
    return b;
  }

  function render() {
    svgEl.innerHTML = '';
    const vals = T.m.map(r => mode < 0 ? r.reduce((s,v) => s+v, 0) : r[mode]);
    const vmax = Math.max(...vals) || 1;

    const step = 50;
    const niceMax = Math.max(step, Math.ceil(vmax / step) * step);

    for (let v = 0; v <= niceMax; v += step) {
      const y = PT + CH - (v / niceMax) * CH;
      mkEl('line', { x1: PL, y1: y, x2: PL+CW, y2: y, stroke: 'var(--gray-1)', 'stroke-width': .5 });
      const t = mkEl('text', { x: PL-4, y: y+4, 'text-anchor': 'end', fill: 'var(--gray-2)', style: 'font:9px var(--ff-mono)' });
      t.textContent = v;
    }

    const yLbl = mkEl('text', { x: 10, y: PT+CH/2, 'text-anchor': 'middle', fill: 'var(--gray-2)', style: 'font:9px var(--ff-mono)', transform: `rotate(-90,10,${PT+CH/2})` });
    yLbl.textContent = 'Menzioni per anno';

    T.m.forEach((row, i) => {
      const yr = T.ymin + i;
      const x  = PL + i * bw;
      let accH = 0;
      T.cats.forEach((c, j) => {
        if (mode >= 0 && j !== mode) return;
        const v = row[j];
        if (!v) return;
        const h = v / niceMax * CH;
        const rect = mkEl('rect', {
          x: x + .3, y: PT+CH-accH-h,
          width: Math.max(bw-0.6, 1), height: h,
          fill: CL[c], style: 'cursor:pointer'
        });
        rect.addEventListener('mousemove', e => {
          tip.style.display = 'block';
          tip.style.left = (e.clientX+12)+'px';
          tip.style.top  = (e.clientY-32)+'px';
          tip.innerHTML = `${yr} · ${lbl(c)}: <strong>${v}</strong> presenze`;
        });
        rect.addEventListener('mouseleave', () => { tip.style.display='none'; });
        accH += h;
      });
    });

    mkEl('line', { x1: PL, y1: PT+CH+.5, x2: PL+CW, y2: PT+CH+.5, stroke: 'var(--ink)', 'stroke-width': 1 });
    for (let yr=1880; yr<=1935; yr+=10) {
      const x = PL + (yr-T.ymin)*bw;
      mkEl('line', { x1:x, y1:PT+CH, x2:x, y2:PT+CH+4, stroke:'var(--gray-2)', 'stroke-width':1 });
      const t = mkEl('text', { x, y:PT+CH+14, 'text-anchor':'middle', fill:'var(--gray-2)', style:'font:9px var(--ff-mono)' });
      t.textContent = yr;
    }
    const xLbl = mkEl('text', { x: PL+CW/2, y: H-3, 'text-anchor': 'middle', fill: 'var(--gray-2)', style: 'font:9px var(--ff-mono)' });
    xLbl.textContent = 'Anni (1879–1939)';

    allBtn.style.background  = mode<0 ? 'var(--ink)' : 'none';
    allBtn.style.color       = mode<0 ? 'var(--paper-light)' : 'var(--ink)';
    allBtn.style.borderColor = 'var(--ink)';
    catBtns.forEach((b, i) => {
      const c = CL[T.cats[i]];
      const isAltre = T.cats[i] === 'ALTRE';
      if (!isAltre) {
        b.style.background  = mode===i ? c : 'none';
        b.style.color       = mode===i ? 'var(--paper-light)' : c;
        b.style.borderColor = c;
      }
    });
  }
  render();
}

