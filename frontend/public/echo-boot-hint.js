/* Connection-aware boot-hint delay. Keep defaults in sync with
   APP_LAYOUT_LOAD_HINT_MS / resolveAppLayoutLoadHintMs() in
   frontend/src/config/appLoadUi.ts. Mobile cold starts (4G/LTE first visit)
   often take 15–22 s; showing a scary "slow or unstable" warning before that
   punishes users whose load is still healthy. */
(function () {
  var conn =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;
  var delay = 22000;
  if (conn) {
    if (conn.saveData) delay = 45000;
    else if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g')
      delay = 45000;
    else if (conn.effectiveType === '3g') delay = 35000;
    else if (
      typeof conn.downlink === 'number' &&
      conn.downlink > 0 &&
      conn.downlink < 1.5
    )
      delay = 35000;
    else if (typeof conn.rtt === 'number' && conn.rtt > 400) delay = 35000;
  }
  setTimeout(function () {
    var el = document.getElementById('echo-boot-hint');
    if (el) el.hidden = false;
  }, delay);
})();
