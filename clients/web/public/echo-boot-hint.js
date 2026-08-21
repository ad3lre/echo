/* Connection-aware boot-hint delay. Keep defaults in sync with
   APP_LAYOUT_LOAD_HINT_MS / resolveAppLayoutLoadHintMs() in
   clients/web/src/config/appLoadUi.ts. With progressive loading, the app shell
   appears in 1-2s, so we only show "slow" warnings for real issues. */
(function () {
  var conn =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;
  var delay = 8000;
  if (conn) {
    if (conn.saveData) delay = 20000;
    else if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g')
      delay = 20000;
    else if (conn.effectiveType === '3g') delay = 15000;
    else if (
      typeof conn.downlink === 'number' &&
      conn.downlink > 0 &&
      conn.downlink < 1.5
    )
      delay = 15000;
    else if (typeof conn.rtt === 'number' && conn.rtt > 400) delay = 15000;
  }
  setTimeout(function () {
    var el = document.getElementById('echo-boot-hint');
    if (el) el.hidden = false;
  }, delay);
})();
