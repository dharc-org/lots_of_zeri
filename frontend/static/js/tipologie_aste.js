/* ── Versione attuale: barre = aste dell'anno, tipologia evidenziata ──
   Ogni barra grigia è il numero di aste dell'anno (con almeno una tipologia
   indicata sul frontespizio). Scegliendo una tipologia si colora la parte
   delle aste in cui compare: un'asta conta una volta sola, quindi la parte
   colorata non supera mai la barra. Dati: aste_py, m_aste, tot_aste. */
async function loadAndRenderTipologieAste() {
  const T     = await fetchJSON('tipologie_oggetti.json');
  const svgEl = document.getElementById('tip-svg');
  const chips = document.getElementById('tip-chips');
  const NS    = 'http://www.w3.org/2000/svg';

  const CL = {
    'DIPINTI':    '#5C0A00',
    'MOBILI':     '#A02800',
    'DISEGNI':    '#D94010',
    'ACQUERELLI': '#E86040',
    'PORCELLANE': '#C87D3E',
    'STAMPE':     '#A07840',
    'ALTRE':      '#7A6050',
  };
  const BASE = 'var(--gray-1)';          /* barre delle aste totali */

  const W=660, H=280, PL=44, PR=6, PB=38, PT=14;
  const CW=W-PL-PR, CH=H-PB-PT;
  const N=T.aste_py.length, bw=CW/N;
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

  /* Pannello Altre (lista completa delle voci) */
  const altrePanel = document.createElement('div');
  altrePanel.style.cssText = 'display:none;background:var(--paper);border:1px solid var(--gray-1);border-radius:4px;padding:1rem 1.25rem;margin-top:.5rem;';
  const altreTitle = document.createElement('div');
  altreTitle.style.cssText = 'font-family:var(--ff-mono);font-size:.7rem;letter-spacing:.1em;color:var(--gray-3);text-transform:uppercase;margin-bottom:.75rem;padding-bottom:.4rem;border-bottom:1px solid var(--gray-1);';
  altreTitle.textContent = 'Il resto degli oggetti all\'incanto';
  altrePanel.appendChild(altreTitle);
  const altreGrid = document.createElement('div');
  altreGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px 2rem;';
  const maxAV = T.altre_voci.length ? T.altre_voci[0][1] : 1;
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
  svgEl.closest('.expl-chart-wrap').appendChild(altrePanel);

  /* Chips: i numeri sono aste (una volta per asta) */
  const allBtn = makeChip('Tutte · ' + T.aste_tot, null, -1);
  chips.appendChild(allBtn);
  const catBtns = T.cats.map((c, i) => {
    const b = makeChip(lbl(c) + ' · ' + T.tot_aste[c], CL[c], i);
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
        if (altreOpen) setTimeout(() => altrePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
        b.style.background = altreOpen ? color : 'none';
        b.style.color      = altreOpen ? 'var(--paper-light)' : color;
        b.querySelector('.chip-arrow i').className = altreOpen ? 'ph ph-caret-up' : 'ph ph-caret-down';
        mode = altreOpen ? idx : -1;
      } else {
        mode = (mode === idx) ? -1 : idx;
      }
      render();
    });
    return b;
  }

  function render() {
    svgEl.innerHTML = '';
    const vmax = Math.max(...T.aste_py) || 1;
    const step = vmax > 150 ? 50 : 25;
    const niceMax = Math.max(step, Math.ceil(vmax / step) * step);

    for (let v = 0; v <= niceMax; v += step) {
      const y = PT + CH - (v / niceMax) * CH;
      mkEl('line', { x1: PL, y1: y, x2: PL+CW, y2: y, stroke: 'var(--gray-1)', 'stroke-width': .5 });
      const t = mkEl('text', { x: PL-4, y: y+4, 'text-anchor': 'end', fill: 'var(--gray-2)', style: 'font:9px var(--ff-mono)' });
      t.textContent = v;
    }
    const yLbl = mkEl('text', { x: 10, y: PT+CH/2, 'text-anchor': 'middle', fill: 'var(--gray-2)', style: 'font:9px var(--ff-mono)', transform: `rotate(-90,10,${PT+CH/2})` });
    yLbl.textContent = 'Aste per anno';

    const cat = mode >= 0 ? T.cats[mode] : null;
    T.aste_py.forEach((tot, i) => {
      const yr = T.ymin + i;
      const x  = PL + i * bw;
      const w  = Math.max(bw - 0.6, 1);
      const hTot = tot / niceMax * CH;
      if (tot) mkEl('rect', { x: x + .3, y: PT+CH-hTot, width: w, height: hTot, fill: BASE });
      const v = cat ? T.m_aste[i][mode] : 0;
      if (v) {
        const h = v / niceMax * CH;
        mkEl('rect', { x: x + .3, y: PT+CH-h, width: w, height: h, fill: CL[cat] });
      }
      /* area sensibile a tutta altezza: il tooltip funziona anche sulle barre basse */
      const hit = mkEl('rect', { x, y: PT, width: bw, height: CH, fill: 'transparent', style: 'cursor:default' });
      hit.addEventListener('mousemove', e => {
        tip.style.display = 'block';
        tip.style.left = (e.clientX+12)+'px';
        tip.style.top  = (e.clientY-32)+'px';
        let s = `${yr} · <strong>${tot}</strong> ${tot === 1 ? 'asta' : 'aste'}`;
        if (cat && tot) {
          const nome = cat === 'ALTRE' ? 'altre tipologie' : lbl(cat).toLowerCase();
          s += `<br>di cui <strong>${v}</strong> con ${nome} (${Math.round(v / tot * 100)}%)`;
        }
        tip.innerHTML = s;
      });
      hit.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });

    mkEl('line', { x1: PL, y1: PT+CH+.5, x2: PL+CW, y2: PT+CH+.5, stroke: 'var(--ink)', 'stroke-width': 1 });
    for (let yr = Math.ceil(T.ymin / 10) * 10; yr <= T.ymax; yr += 10) {
      const x = PL + (yr - T.ymin) * bw + bw / 2;
      mkEl('line', { x1:x, y1:PT+CH, x2:x, y2:PT+CH+4, stroke:'var(--gray-2)', 'stroke-width':1 });
      const t = mkEl('text', { x, y:PT+CH+14, 'text-anchor':'middle', fill:'var(--gray-2)', style:'font:9px var(--ff-mono)' });
      t.textContent = yr;
    }
    const xLbl = mkEl('text', { x: PL+CW/2, y: H-3, 'text-anchor': 'middle', fill: 'var(--gray-2)', style: 'font:9px var(--ff-mono)' });
    xLbl.textContent = `Anni (${T.ymin}–${T.ymax})`;

    allBtn.style.background  = mode < 0 ? 'var(--ink)' : 'none';
    allBtn.style.color       = mode < 0 ? 'var(--paper-light)' : 'var(--ink)';
    allBtn.style.borderColor = 'var(--ink)';
    catBtns.forEach((b, i) => {
      if (T.cats[i] === 'ALTRE') return;
      const c = CL[T.cats[i]];
      b.style.background  = mode === i ? c : 'none';
      b.style.color       = mode === i ? 'var(--paper-light)' : c;
      b.style.borderColor = c;
    });
  }
  render();
}
