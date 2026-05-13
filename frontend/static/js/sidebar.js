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

  /* ── Ricerca dentro i facet ─────────────────────────── */
  document.querySelectorAll('.facet-search').forEach(function(input) {
    input.addEventListener('input', function() {
      var query = input.value.toLowerCase();
      var facetId = input.dataset.facet;
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
  });

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
