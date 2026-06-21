/* ══════════════════════════════════════════════════════════
   esplora.js
   Gestisce: tab, heatstrip case d'asta, grafo banditori,
             barre tipologie, mappa D3-geo trend mercato
   ══════════════════════════════════════════════════════════ */

'use strict';

/* ── Percorso base dei JSON statici ────────────────────── */
const DATA_BASE = '/static/data/';

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
    case 'banditori': loadAndRenderBanditori(); break;
    case 'tipologie': loadAndRenderTipologie(); break;
    case 'trend':     loadAndRenderTrend();     break;
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
  const panel = document.getElementById('panel-case');
  const wrap  = panel.querySelector('.expl-chart-wrap');
  const NS = 'http://www.w3.org/2000/svg';
  const N  = C.ymax - C.ymin + 1;

  /* Svuoto il wrap e imposto struttura a tabella */
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
    <div style="font:500 12px var(--ff-body);color:var(--ink);">Città</div>
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
  tipEl.style.cssText = 'position:fixed;background:var(--ink);color:var(--paper-light);font:11px var(--ff-mono);padding:3px 7px;border-radius:2px;pointer-events:none;display:none;z-index:200;white-space:nowrap;';
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
    const maxV = Math.max(...Object.values(h.py));
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
    wrapper.innerHTML =
      `<div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>` +
      `<div style="font:10.5px var(--ff-mono);color:var(--gray-2);">${h.city}</div>`;
    wrapper.appendChild(svgWrap);
    wrapper.insertAdjacentHTML('beforeend',
      `<div style="font:11px var(--ff-mono);color:var(--terra);text-align:right;">${h.t}</div>`);

    tbody.appendChild(wrapper);
  });
}


async function loadAndRenderBanditori() {
  const B  = await fetchJSON('banditori.json');
  const NS = 'http://www.w3.org/2000/svg';
  const panel = document.getElementById('panel-banditori');
  const wrap  = document.getElementById('band-wrap');

  wrap.style.cssText = 'background:var(--paper);border:1px solid var(--gray-1);border-radius:4px;margin-bottom:.75rem;overflow:hidden;';

  /* Intestazione fissa */
  const thead = document.createElement('div');
  thead.style.cssText = 'display:grid;grid-template-columns:260px 1fr;border-bottom:1px solid var(--gray-1);box-shadow:0 3px 8px rgba(26,20,16,.08);background:var(--paper);';

  const thLeft = document.createElement('div');
  thLeft.style.cssText = 'padding:.75rem 1rem;border-right:1px solid var(--gray-1);display:flex;flex-direction:column;justify-content:center;';
  thLeft.innerHTML = `
    <div style="font-family:var(--ff-body);font-size:.8rem;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--gray-3);">Banditori</div>
    <div style="font-family:var(--ff-mono);font-size:.78rem;color:var(--gray-2);margin-top:.15rem;">${B.all.length} documentati nel corpus</div>
  `;

  const thRight = document.createElement('div');
  thRight.style.cssText = 'padding:.75rem 1rem;display:flex;justify-content:space-between;align-items:flex-start;';
  thRight.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;gap:.4rem;">
        <div style="font-family:var(--ff-body);font-size:.8rem;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--gray-3);">Banditori con relazioni ricorrenti</div>
        <div id="band-info-btn" style="width:15px;height:15px;border-radius:50%;border:1.5px solid var(--gray-2);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-family:var(--ff-mono);font-size:.62rem;color:var(--gray-2);position:relative;" title="Come funziona">i
          <div id="band-info-tooltip" style="display:none;position:absolute;top:calc(100% + 6px);left:0;background:var(--ink);color:var(--paper-light);font-family:var(--ff-body);font-size:.75rem;line-height:1.55;padding:.6rem .85rem;border-radius:3px;width:260px;z-index:50;pointer-events:none;">Clicca un nome nella lista o un nodo nel grafico per isolare i legami. Clicca di nuovo per tornare alla vista completa.</div>
        </div>
      </div>
      <div style="font-family:var(--ff-mono);font-size:.78rem;color:var(--gray-2);margin-top:.15rem;" id="band-hint">Clicca un nome nella lista per evidenziarne i legami</div>
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
  const hint = document.getElementById('band-hint');

  B.all.forEach(b => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:4px;padding:5px 10px;border-bottom:0.5px solid rgba(192,175,152,.35);cursor:pointer;align-items:center;transition:background .1s;background:var(--paper);';
    const nameColor = b.rel ? 'var(--ink)' : 'var(--gray-2)';
    row._nameColor = nameColor;
    row.innerHTML = `
      <span style="font-size:.78rem;color:${nameColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${b.n}">${b.n}</span>
      <span style="font-family:var(--ff-mono);font-size:.7rem;color:var(--gray-2);">${b.t}</span>
    `;
    row.addEventListener('mouseover', () => { if(!row.dataset.sel) row.style.background='rgba(217,64,16,.05)'; });
    row.addEventListener('mouseout',  () => { if(!row.dataset.sel) row.style.background='var(--paper)'; });
    row.addEventListener('click', () => {
      const topIdx = B.top_band.findIndex(tb => tb.n === b.n);
      const hasEdge = B.edges.some(e => e[0] === topIdx);

      /* secondo click → reset */
      if (row.dataset.sel) {
        selBand = null;
        resetLista();
        render();
        return;
      }

      resetLista();
      if(topIdx >= 0 && hasEdge) {
        row.style.background='rgba(217,64,16,.1)';
        row.dataset.sel='1';
        row.querySelector('span').style.color='var(--terra)';
        selBand = topIdx;
        hint.style.color='var(--terra)'; hint.textContent = b.n + ' — ' + b.t + ' aste documentate';
      } else {
        selBand = -1;
        hint.style.color='var(--terra)'; hint.innerHTML = b.n + ' — ' + b.t + (b.t===1?' asta':' aste') + ', nessuna relazione ricorrente con le case d\'asta nel <em>corpus</em>';
      }
      render();
    });
    listBody.appendChild(row);
    rows.push(row);
  });

  /* Grafico */
  const grafDiv = document.createElement('div');
  grafDiv.style.cssText = 'display:flex;flex-direction:column;padding:.75rem 1rem;background:var(--paper);';
  tbody.appendChild(grafDiv);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 400 480');
  svg.style.cssText = 'width:100%;flex:1;display:block;';
  grafDiv.appendChild(svg);

  /* SVG bipartito */
  const LX=130, RX=270, T0=20, T1=450;
  const ly = i => T0 + i*(T1-T0)/Math.max(B.top_band.length-1,1);
  const ry = i => T0 + i*(T1-T0)/Math.max(B.case.length-1,1);
  const eEls=[], lEls=[], rEls=[];

  function svgEl(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for(const k in attrs) e.setAttribute(k, attrs[k]);
    svg.appendChild(e);
    return e;
  }

  B.edges.forEach(([a,b,n]) => {
    const y1=ly(a), y2=ry(b), mx=(LX+RX)/2;
    const p = svgEl('path', {
      d: `M ${LX+5} ${y1} C ${mx} ${y1},${mx} ${y2},${RX-5} ${y2}`,
      fill:'none', stroke:'var(--terra)',
      'stroke-width': Math.max(1.5, Math.sqrt(n)*.9),
      'stroke-opacity':'.35', 'stroke-linecap':'round'
    });
    eEls.push({p,a,b:b,n});
  });

  /* Funzione reset lista */
  function resetLista() {
    rows.forEach(r => {
      r.style.background = 'var(--paper)';
      delete r.dataset.sel;
      r.querySelector('span').style.color = r._nameColor;
    });
    hint.style.color='var(--gray-2)'; hint.textContent = 'Clicca un nome nella lista per evidenziarne i legami';
  }

  B.top_band.forEach((band,i) => {
    const y=ly(i);
    const c=svgEl('circle',{cx:LX,cy:y,r:5,fill:'var(--terra)','fill-opacity':'.6',stroke:'var(--terra-dark)','stroke-width':'1',style:'cursor:pointer'});
    const t=svgEl('text',{x:LX-9,y:y+4,'text-anchor':'end',fill:'var(--ink)'});
    t.style.font='9px var(--ff-body)';
    t.style.cursor='pointer';
    t.textContent = band.n.length>28 ? band.n.slice(0,27)+'…' : band.n;

    /* Click sul nodo → seleziona e rispecchia in lista */
    [c,t].forEach(el => el.addEventListener('click', () => {
      if (selBand === i) {
        /* secondo click → reset */
        selBand = null;
        resetLista();
      } else {
        selBand = i;
        resetLista();
        /* evidenzia riga corrispondente nella lista */
        const row = rows.find(r => r.querySelector('span').title === band.n);
        if (row) {
          row.style.background = 'rgba(217,64,16,.1)';
          row.dataset.sel = '1';
          row.querySelector('span').style.color = 'var(--terra)';
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
    if (e.target === svg) {
      selBand = null;
      resetLista();
      render();
    }
  });

  function render() {
    eEls.forEach(e => {
      const on = selBand===null || selBand===e.a;
      e.p.setAttribute('stroke-opacity', on?(selBand!==null?'.75':'.35'):'.04');
    });
    lEls.forEach((n,i) => {
      const on = selBand===null || selBand===i;
      [n.c,n.t].forEach(x=>x.setAttribute('opacity',on?1:.2));
    });
    rEls.forEach((n,i) => {
      const on = selBand===null || eEls.some(e=>e.a===selBand&&e.b===i);
      [n.c,n.t].forEach(x=>x.setAttribute('opacity',on?1:.2));
    });
  }

  /* Pulsante info interazione */
  const infoBtn = document.getElementById('band-info-btn');
  const infoTip = document.getElementById('band-info-tooltip');
  if (infoBtn && infoTip) {
    infoBtn.addEventListener('click', e => {
      e.stopPropagation();
      infoTip.style.display = infoTip.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', () => { infoTip.style.display = 'none'; });
  }

  render();
}


async function loadAndRenderTipologie() {
  const T     = await fetchJSON('tipologie_oggetti.json');
  const svgEl = document.getElementById('tip-svg');
  const chips = document.getElementById('tip-chips');
  const panel = document.getElementById('panel-tipologie');
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
  tip.style.cssText = 'position:fixed;background:var(--ink);color:var(--paper-light);font:11px var(--ff-mono);padding:4px 8px;border-radius:2px;pointer-events:none;display:none;z-index:200;white-space:nowrap;line-height:1.6;';
  document.body.appendChild(tip);

  /* Pannello Altre */
  const altrePanel = document.createElement('div');
  altrePanel.style.cssText = 'display:none;background:var(--paper);border:1px solid var(--gray-1);border-radius:4px;padding:1rem 1.25rem;margin-top:.5rem;';

  const altreTitle = document.createElement('div');
  altreTitle.style.cssText = 'font-family:var(--ff-mono);font-size:.7rem;letter-spacing:.1em;color:var(--gray-3);text-transform:uppercase;margin-bottom:.75rem;padding-bottom:.4rem;border-bottom:1px solid var(--gray-1);';
  altreTitle.textContent = `La categoria «Altre» include ${T.altre_voci.length} voci`;
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
  const chartWrap = panel.querySelector('.expl-chart-wrap');
  chartWrap.after(altrePanel);

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
    b.className = 'expl-chip';
    const isAltre = T.cats[idx] === 'ALTRE';
    b.innerHTML = isAltre ? label + ' <span class="chip-arrow">▾</span>' : label;
    b.style.color = color || 'var(--ink)';
    b.style.borderColor = color || 'var(--ink)';
    b.addEventListener('click', () => {
      if (isAltre) {
        altreOpen = !altreOpen;
        altrePanel.style.display = altreOpen ? 'block' : 'none';
        if (altreOpen) { setTimeout(() => altrePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50); }
        if (altreOpen) { setTimeout(() => altrePanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
        b.style.background  = altreOpen ? color : 'none';
        b.style.color       = altreOpen ? 'var(--paper-light)' : color;
        b.querySelector('.chip-arrow').textContent = altreOpen ? '▴' : '▾';
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

    [0.2, 0.4, 0.6, 0.8, 1].forEach(f => {
      const y = PT + CH - f * CH;
      mkEl('line', { x1: PL, y1: y, x2: PL+CW, y2: y, stroke: 'var(--gray-1)', 'stroke-width': .5 });
      const t = mkEl('text', { x: PL-4, y: y+4, 'text-anchor': 'end', fill: 'var(--gray-2)', style: 'font:9px var(--ff-mono)' });
      t.textContent = Math.round(vmax * f);
    });

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
        const h = v / vmax * CH;
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


async function loadAndRenderTrend() {
  const [D, world] = await Promise.all([
    fetchJSON('trend_mercato.json'),
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r => r.json())
  ]);

  const mapEl   = document.getElementById('trend-map');
  const tooltip = document.getElementById('trend-tooltip');
  const noteCount = document.getElementById('trend-note-count');
  const noteTot   = document.getElementById('trend-note-tot');

  /* ── Dimensioni mappa ──────────────────────────────────── */
  const W = mapEl.parentElement.clientWidth || 800;
  const H = Math.round(W * 0.52);
  mapEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  mapEl.style.height = H + 'px';

  /* ── Proiezione centrata sull'Europa ────────────────────── */
  const projection = d3.geoMercator()
    .center([14, 50])
    .scale(W * 1.05)
    .translate([W * 0.42, H * 0.52]);

  const path = d3.geoPath().projection(projection);

  /* ── Disegno sfondo terre ───────────────────────────────── */
  const countries = topojson
    ? topojson.feature(world, world.objects.countries)
    : { type: 'FeatureCollection', features: [] };

  const g = d3.select(mapEl);

  g.append('rect').attr('width', W).attr('height', H).attr('fill', 'var(--paper-dark)');

  g.selectAll('.country')
    .data(countries.features)
    .enter().append('path')
    .attr('class', 'country')
    .attr('d', path)
    .attr('fill', 'var(--paper)')
    .attr('stroke', 'var(--gray-1)')
    .attr('stroke-width', .5);

  /* ── Cerchi città ───────────────────────────────────────── */
  const circlesG = g.append('g').attr('class', 'cities');

  /* ── Timeline brush ─────────────────────────────────────── */
  const track   = document.getElementById('tl-track');
  const brush   = document.getElementById('tl-brush');
  const hLeft   = document.getElementById('tl-h-left');
  const hRight  = document.getElementById('tl-h-right');
  const canvas  = document.getElementById('tl-hist');
  const lblFrom = document.getElementById('tl-from');
  const lblTo   = document.getElementById('tl-to');

  const YMIN = D.ymin, YMAX = D.ymax, NYEARS = YMAX - YMIN + 1;
  let yearFrom = YMIN, yearTo = YMAX;

  /* Disegna istogramma sfondo */
  function drawHist() {
    const tw = track.clientWidth || 600;
    canvas.width = tw;
    const ctx = canvas.getContext('2d');
    const max = Math.max(...D.ytotals);
    ctx.clearRect(0, 0, tw, 28);
    D.ytotals.forEach((v, i) => {
      const x = i / NYEARS * tw;
      const w = Math.max(1, tw / NYEARS - .5);
      const h = v / max * 24;
      ctx.fillStyle = 'rgba(217,64,16,.35)';
      ctx.fillRect(x, 28 - h, w, h);
    });
  }

  function yearToX(y) {
    const tw = track.clientWidth || 600;
    return (y - YMIN) / NYEARS * tw;
  }

  function xToYear(x) {
    const tw = track.clientWidth || 600;
    return Math.round(YMIN + (x / tw) * NYEARS);
  }

  function updateBrush() {
    const tw = track.clientWidth || 600;
    const x0 = yearToX(yearFrom);
    const x1 = yearToX(yearTo + 1);
    brush.style.left  = x0 + 'px';
    brush.style.width = (x1 - x0) + 'px';
    lblFrom.textContent = yearFrom;
    lblTo.textContent   = yearTo;
    updateMap();
  }

  /* Drag logica */
  function makeDraggable(handle, which) {
    let dragging = false, startX = 0;
    handle.addEventListener('mousedown', e => { dragging = true; startX = e.clientX; e.preventDefault(); });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      startX = e.clientX;
      const tw = track.clientWidth || 600;
      const dy = Math.round(dx / tw * NYEARS);
      if (which === 'left') {
        yearFrom = Math.max(YMIN, Math.min(yearTo - 1, yearFrom + dy));
      } else {
        yearTo = Math.min(YMAX, Math.max(yearFrom + 1, yearTo + dy));
      }
      updateBrush();
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  makeDraggable(hLeft,  'left');
  makeDraggable(hRight, 'right');

  /* Click sulla track per spostare il brush */
  track.addEventListener('click', e => {
    if (e.target === hLeft || e.target === hRight || e.target === brush) return;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = xToYear(x);
    const span = yearTo - yearFrom;
    yearFrom = Math.max(YMIN, y - Math.floor(span / 2));
    yearTo   = Math.min(YMAX, yearFrom + span);
    updateBrush();
  });

  /* ── Aggiorna cerchi mappa ──────────────────────────────── */
  function updateMap() {
    /* Conta eventi per città nel range selezionato */
    const cityTotals = D.cities.map(c => {
      let tot = 0;
      for (let y = yearFrom; y <= yearTo; y++) {
        tot += (c.py[y] || 0);
      }
      return { ...c, visible: tot };
    }).filter(c => c.visible > 0);

    const maxV = Math.max(...cityTotals.map(c => c.visible), 1);
    const rScale = v => Math.max(4, Math.sqrt(v / maxV) * 32);

    /* Aggiorna totale nota */
    const totInRange = cityTotals.reduce((s, c) => s + c.visible, 0);
    noteCount.textContent = totInRange;
    noteTot.textContent   = D.tot;

    /* Cerchi */
    const circles = circlesG.selectAll('circle').data(cityTotals, d => d.n);

    circles.enter().append('circle')
      .attr('cx', d => {
        const p = projection([d.lon, d.lat]);
        return p ? p[0] : -999;
      })
      .attr('cy', d => {
        const p = projection([d.lon, d.lat]);
        return p ? p[1] : -999;
      })
      .attr('fill', 'var(--terra)')
      .attr('fill-opacity', .55)
      .attr('stroke', 'var(--terra-dark)')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', function(event, d) {
        d3.select(this).attr('fill-opacity', .85);
        tooltip.style.display = 'block';
        tooltip.innerHTML = `<strong>${d.n}</strong><br>${d.visible} eventi · ${d.org}`;
      })
      .on('mousemove', function(event) {
        const wrap = mapEl.parentElement.getBoundingClientRect();
        tooltip.style.left = (event.clientX - wrap.left + 10) + 'px';
        tooltip.style.top  = (event.clientY - wrap.top  - 10) + 'px';
      })
      .on('mouseleave', function() {
        d3.select(this).attr('fill-opacity', .55);
        tooltip.style.display = 'none';
      })
      .merge(circles)
      .transition().duration(300)
      .attr('r', d => rScale(d.visible));

    circles.exit().remove();
  }

  /* Avvio */
  drawHist();
  updateBrush();
}

/* ── Carica topojson se necessario ──────────────────────── */
if (typeof topojson === 'undefined') {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';
  s.onload = () => { /* topojson ora disponibile */ };
  document.head.appendChild(s);
}
