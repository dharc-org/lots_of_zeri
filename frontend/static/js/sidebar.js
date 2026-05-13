document.addEventListener('DOMContentLoaded', function () {

  var sidebar    = document.getElementById('zac-sidebar');
  var toggleBtn  = document.getElementById('zac-sidebar-toggle');
  if (!sidebar || !toggleBtn) return;

  var toggleText = toggleBtn.querySelector('.toggle-text');

  toggleBtn.addEventListener('click', function () {
    var isCollapsed = sidebar.classList.toggle('is-collapsed');
    toggleText.textContent = isCollapsed ? 'Mostra filtri' : 'Nascondi filtri';
  });

});