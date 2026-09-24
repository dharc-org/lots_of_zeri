document.addEventListener('DOMContentLoaded', function () {

  /* ── Toggle sidebar ─────────────────────────────────── */
  var sidebar    = document.getElementById('zac-sidebar');
  var toggleBtn  = document.getElementById('zac-sidebar-toggle');
  if (sidebar && toggleBtn) {
    var toggleText = toggleBtn.querySelector('.toggle-text');
    toggleBtn.addEventListener('click', function () {
      var isCollapsed = sidebar.classList.toggle('is-collapsed');
      toggleText.textContent = isCollapsed ? 'Mostra filtri' : 'Nascondi filtri';
    });
  }

  /* ── Altezza del pannello filtri = spazio visibile sotto il suo bordo superiore ──
     Senza questo, a pagina non ancora scorsa il pannello parte sotto intestazione e
     barra di ricerca ma è alto quasi tutto lo schermo: il fondo (con il bottone Cerca)
     esce dallo schermo. Si ricalcola a ogni scroll/resize finché il pannello diventa sticky. */
  var sbPanel = document.querySelector('.zac-sidebar-panel');
  var sbCard  = document.querySelector('.zac-sidebar-card');
  if (sbPanel && sbCard) {
    var fitPending = false;
    var fitPanel = function () {
      fitPending = false;
      var top = sbCard.getBoundingClientRect().top;
      var h   = Math.max(160, Math.floor(window.innerHeight - Math.max(top, 0) - 16));
      sbCard.style.maxHeight  = h + 'px';
      sbPanel.style.maxHeight = (h - 2) + 'px';   // 2px = bordo della card
    };
    var requestFit = function () {
      if (!fitPending) { fitPending = true; window.requestAnimationFrame(fitPanel); }
    };
    fitPanel();
    window.addEventListener('scroll', requestFit, { passive: true });
    window.addEventListener('resize', requestFit);
  }

  /* ── Ricerca dentro i facet ─────────────────────────── */
  document.querySelectorAll('.facet-search').forEach(function(input) {
    input.addEventListener('input', function() {
      var query = input.value.toLowerCase();
      var facetId = input.dataset.facet;
      var list = input.parentElement.querySelector('.facet-list');
      if (list) list.classList.toggle('is-searching', query !== '');
      document.querySelectorAll('[id^="chk_' + facetId + '"]').forEach(function(chk) {
        var row = chk.closest('.form-check');
        var label = row.querySelector('span').textContent.toLowerCase();
        row.style.display = label.includes(query) ? '' : 'none';
      });
    });
  });

  /* ── Istogramma sync con slider ─────────────────────── */
  function syncHistogram(sliderEl, fromVal, toVal) {
    var facet = sliderEl.closest('.facet');
    if (!facet) return;
    var histogram = facet.querySelector('.facet-histogram');
    if (!histogram) return;

    var bars = histogram.querySelectorAll('.histogram-bar');
    var total = bars.length;
    var min = parseInt(sliderEl.dataset.min, 10);
    var max = parseInt(sliderEl.dataset.max, 10);

    bars.forEach(function(bar, i) {
      var barYear = min + (i / total) * (max - min);
      if (barYear >= fromVal && barYear <= toVal) {
        bar.classList.add('active');
      } else {
        bar.classList.remove('active');
      }
    });
  }

  /* ── noUiSlider init ────────────────────────────────── */
  document.querySelectorAll('[id^="slider_"]').forEach(function (el) {
    if (typeof noUiSlider === 'undefined' || el.noUiSlider) return;

    var minV  = parseInt(el.dataset.min,  10);
    var maxV  = parseInt(el.dataset.max,  10);
    var fromV = parseInt(el.dataset.from, 10) || minV;
    var toV   = parseInt(el.dataset.to,   10) || maxV;

    var facetId  = el.id.replace('slider_', '');
    var dispFrom = document.getElementById('disp_' + facetId + '_from');
    var dispTo   = document.getElementById('disp_' + facetId + '_to');
    var inpFrom  = document.getElementById('inp_'  + facetId + '_from');
    var inpTo    = document.getElementById('inp_'  + facetId + '_to');

    if (dispFrom) dispFrom.textContent = fromV;
    if (dispTo)   dispTo.textContent   = toV;
    if (inpFrom)  inpFrom.value = fromV;
    if (inpTo)    inpTo.value   = toV;

    noUiSlider.create(el, {
      start:   [fromV, toV],
      connect: true,
      step:    1,
      range:   { min: minV, max: maxV }
    });

    /* Sync iniziale */
    syncHistogram(el, fromV, toV);

    el.noUiSlider.on('update', function (values) {
      var f = Math.round(parseFloat(values[0]));
      var t = Math.round(parseFloat(values[1]));
      if (dispFrom) dispFrom.textContent = f;
      if (dispTo)   dispTo.textContent   = t;
      if (inpFrom)  inpFrom.value = f;
      if (inpTo)    inpTo.value   = t;
      syncHistogram(el, f, t);
    });

    /* Lo slider non genera "change" sul form: lo segnaliamo noi */
    el.noUiSlider.on('change', function () {
      var form = el.closest('form');
      if (form) form.dispatchEvent(new Event('change'));
    });
  });

  /* ── "Mostra tutte" / "Mostra meno" nelle liste dei filtri ── */
  // un ramo nascosto che contiene una voce spuntata resta visibile
  document.querySelectorAll('.facet-list .is-extra').forEach(function (el) {
    if (el.querySelector('input:checked')) el.classList.remove('is-extra');
  });
  document.querySelectorAll('.facet-more').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var list = btn.previousElementSibling;
      var isOpen = !list.classList.toggle('is-collapsed');
      btn.textContent = isOpen ? btn.dataset.less : btn.dataset.more;
    });
  });

  /* ── Bottone Cerca: segnala i filtri modificati e non ancora applicati ── */
  var facetForm = document.getElementById('facet-form');
  var cta       = facetForm && facetForm.querySelector('.sidebar-cta');
  var ctaLabel  = cta && cta.querySelector('.cta-label');
  if (ctaLabel) {
    var snapshot = function () {
      var set = new Set();
      new FormData(facetForm).forEach(function (v, k) { set.add(k + '=' + v); });
      return set;
    };
    var initial = snapshot();   // dopo l'init degli slider
    var replay = function (cls) {   // riavvia l'animazione anche se la classe c'era già
      cta.classList.remove('nudge', 'bump'); void cta.offsetWidth; cta.classList.add(cls);
    };
    facetForm.addEventListener('change', function () {
      var now = snapshot(), changed = new Set();
      var diff = function (a, b) {
        a.forEach(function (p) {
          if (b.has(p)) return;
          var k = p.split('=')[0];
          // un range (anno_from / anno_to) conta come una sola modifica
          changed.add(/_(from|to)$/.test(k) ? k.replace(/_(from|to)$/, '') : p);
        });
      };
      diff(initial, now); diff(now, initial);
      var n = changed.size;
      var wasOn = cta.classList.contains('has-changes');
      var oldLabel = ctaLabel.textContent;
      cta.classList.toggle('has-changes', n > 0);
      ctaLabel.textContent = n > 0 ? 'Applica filtri (' + n + ')' : 'Cerca';
      // prima modifica: sobbalzo + alone; modifiche successive: piccolo "pop" del contatore
      if (n > 0 && !wasOn)                              replay('nudge');
      else if (n > 0 && oldLabel !== ctaLabel.textContent) replay('bump');
    });
  }

});

/* ── Torna su ───────────────────────────────────────────── */
var backTop = document.getElementById('btn-back-top');
if (backTop) {
  window.addEventListener('scroll', function () {
    if (window.scrollY > 400) {
      backTop.classList.add('visible');
    } else {
      backTop.classList.remove('visible');
    }
  });
  backTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
