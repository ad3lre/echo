/* Apply persisted theme before first paint (AMOLED default when unset). */
(function () {
  try {
    var raw = localStorage.getItem('echo_theme_v1');
    var id =
      raw === 'Light' || raw === 'Dark' || raw === 'Amoled' || raw === 'Sunny'
        ? raw
        : 'Amoled';
    var sync = localStorage.getItem('echo_theme_sync_system_v1') === '1';
    if (sync && window.matchMedia) {
      id = window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'Light'
        : 'Amoled';
    }
    var dark = id !== 'Light' && id !== 'Sunny';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (id === 'Amoled') {
      document.documentElement.dataset.echoDarkVariant = 'amoled';
    }
    if (id === 'Sunny') {
      document.documentElement.dataset.echoLightVariant = 'sunny';
    }
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.dataset.echoDarkVariant = 'amoled';
  }
})();
