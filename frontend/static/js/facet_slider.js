document.addEventListener('DOMContentLoaded', function () {
  const slider = document.getElementById('slider_periodo');
  if (!slider || typeof noUiSlider === 'undefined') return;

  const dispFrom = document.getElementById('disp_from');
  const dispTo   = document.getElementById('disp_to');
  const inpFrom  = document.getElementById('inp_year_from');
  const inpTo    = document.getElementById('inp_year_to');

  const yearMin = parseInt(slider.dataset.min);
  const yearMax = parseInt(slider.dataset.max);
  const fromVal = parseInt(slider.dataset.from) || yearMin;
  const toVal   = parseInt(slider.dataset.to)   || yearMax;

  dispFrom.textContent = fromVal;
  dispTo.textContent   = toVal;
  inpFrom.value = fromVal;
  inpTo.value   = toVal;

  noUiSlider.create(slider, {
    start:   [fromVal, toVal],
    connect: true,
    step:    1,
    range:   { min: yearMin, max: yearMax }
  });

  slider.noUiSlider.on('update', function (values) {
    const f = Math.round(parseFloat(values[0]));
    const t = Math.round(parseFloat(values[1]));
    dispFrom.textContent = f;
    dispTo.textContent   = t;
    inpFrom.value = f;
    inpTo.value   = t;
  });
});