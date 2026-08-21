import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseIntegerInRange } from './lib/number-parse.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Watchdog Proxy & Maintenance Server
 *
 * listens on WATCHDOG_PORT (default 80 or 3005)
 * proxies by Host header when WATCHDOG_HOST_TARGETS is configured
 * falls back to TARGET_HOST/TARGET_PORT when no host rule matches
 * serves a nice maintenance page if the selected target is down.
 */

const WATCHDOG_PORT = parseIntegerInRange(
  process.env.WATCHDOG_PORT,
  3005,
  1,
  65_535,
);
const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1';
const TARGET_PORT = parseIntegerInRange(
  process.env.TARGET_PORT,
  8080,
  1,
  65_535,
);
const WATCHDOG_HOST_TARGETS = process.env.WATCHDOG_HOST_TARGETS || '';
const CHECK_INTERVAL_MS = 2000;
const DOWNTIME_FILE = path.join(__dirname, 'downtime-stats.json');

function normalizeHost(host) {
  return String(host || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function createTarget(host, port) {
  return {
    host,
    port,
    key: `${host}:${port}`,
  };
}

function parseHostTargets(raw) {
  const hostMap = new Map();
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [hostPart, targetPart] = trimmed.split('=');
    const normalizedHost = normalizeHost(hostPart);
    if (!normalizedHost || !targetPart) continue;
    const separatorIndex = targetPart.lastIndexOf(':');
    if (separatorIndex <= 0) continue;
    const targetHost = targetPart.slice(0, separatorIndex).trim();
    const targetPort = parseInt(
      targetPart.slice(separatorIndex + 1).trim(),
      10,
    );
    if (!targetHost || !Number.isFinite(targetPort)) continue;
    hostMap.set(normalizedHost, createTarget(targetHost, targetPort));
  }
  return hostMap;
}

const defaultTarget = createTarget(TARGET_HOST, TARGET_PORT);
const hostTargets = parseHostTargets(WATCHDOG_HOST_TARGETS);
const uniqueTargets = new Map([[defaultTarget.key, defaultTarget]]);

for (const target of hostTargets.values()) {
  uniqueTargets.set(target.key, target);
}

const targetStates = new Map(
  [...uniqueTargets.values()].map((target) => [
    target.key,
    {
      isUp: false,
      downtimeStart: null,
      avgDowntimeSeconds: 30,
      historicalDowntimes: [],
    },
  ]),
);

function getTargetState(target) {
  const existing = targetStates.get(target.key);
  if (existing) return existing;
  const next = {
    isUp: false,
    downtimeStart: null,
    avgDowntimeSeconds: 30,
    historicalDowntimes: [],
  };
  targetStates.set(target.key, next);
  return next;
}

function persistDowntimeStats() {
  try {
    const targets = {};
    for (const [targetKey, state] of targetStates.entries()) {
      targets[targetKey] = { history: state.historicalDowntimes };
    }
    fs.writeFileSync(DOWNTIME_FILE, JSON.stringify({ targets }, null, 2));
  } catch (e) {
    console.error('[watchdog] Failed to save downtime stats', e);
  }
}

// Load historical data
try {
  if (fs.existsSync(DOWNTIME_FILE)) {
    const data = JSON.parse(fs.readFileSync(DOWNTIME_FILE, 'utf8'));
    if (data?.targets && typeof data.targets === 'object') {
      for (const [targetKey, payload] of Object.entries(data.targets)) {
        const state = targetStates.get(targetKey);
        if (!state) continue;
        state.historicalDowntimes = Array.isArray(payload?.history)
          ? payload.history
          : [];
        if (state.historicalDowntimes.length > 0) {
          state.avgDowntimeSeconds = Math.round(
            state.historicalDowntimes.reduce((a, b) => a + b, 0) /
              state.historicalDowntimes.length,
          );
        }
      }
    } else if (Array.isArray(data?.history)) {
      const state = getTargetState(defaultTarget);
      state.historicalDowntimes = data.history;
      if (state.historicalDowntimes.length > 0) {
        state.avgDowntimeSeconds = Math.round(
          state.historicalDowntimes.reduce((a, b) => a + b, 0) /
            state.historicalDowntimes.length,
        );
      }
    }
  }
} catch (e) {
  console.error('[watchdog] Failed to load downtime stats', e);
}

function saveDowntime(target, seconds) {
  const state = getTargetState(target);
  state.historicalDowntimes.push(seconds);
  if (state.historicalDowntimes.length > 10) state.historicalDowntimes.shift();
  state.avgDowntimeSeconds = Math.round(
    state.historicalDowntimes.reduce((a, b) => a + b, 0) /
      state.historicalDowntimes.length,
  );
  persistDowntimeStats();
}

// Basic health check loop
async function checkTarget(target) {
  return new Promise((resolve) => {
    const socket = net.createConnection(
      { host: target.host, port: target.port },
      () => {
        socket.end();
        resolve(true);
      },
    );
    socket.setTimeout(1000);
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function updateStatus() {
  for (const target of uniqueTargets.values()) {
    const state = getTargetState(target);
    const nextUp = await checkTarget(target);

    if (state.isUp && !nextUp) {
      state.downtimeStart = Date.now();
      console.log(`[watchdog] Target ${target.key} is DOWN. Starting timer.`);
    } else if (!state.isUp && nextUp) {
      if (state.downtimeStart) {
        const duration = Math.round((Date.now() - state.downtimeStart) / 1000);
        console.log(
          `[watchdog] Target ${target.key} is UP. Downtime lasted ${duration}s.`,
        );
        saveDowntime(target, duration);
        state.downtimeStart = null;
      }
    } else if (!nextUp && !state.downtimeStart) {
      // Target already down on first observation (e.g. process started mid-outage).
      state.downtimeStart = Date.now();
    }

    state.isUp = nextUp;
  }
  setTimeout(updateStatus, CHECK_INTERVAL_MS);
}
updateStatus();

function resolveTarget(req) {
  const host = normalizeHost(req.headers.host);
  return hostTargets.get(host) || defaultTarget;
}

function getMaintenanceHtml(target, req) {
  const state = getTargetState(target);
  const elapsed = state.downtimeStart
    ? Math.round((Date.now() - state.downtimeStart) / 1000)
    : 0;
  const estimate = Math.max(state.avgDowntimeSeconds, 15);
  const requestHost = normalizeHost(req.headers.host) || 'echo';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Echo | Maintenance</title>
    <style>
        :root {
            --bg: #0d0812;
            --text: #ffffff;
            --accent: #c084fc;
            --glass-bg: rgba(255, 255, 255, 0.03);
            --glass-border: rgba(255, 255, 255, 0.08);
            --glass-blur: blur(12px);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background-color: var(--bg);
            color: var(--text);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }

        .bg-glow {
            position: fixed;
            width: 60vw;
            height: 60vw;
            background: radial-gradient(circle, rgba(192, 132, 252, 0.15) 0%, transparent 70%);
            z-index: -1;
            filter: blur(80px);
            animation: drift 20s infinite alternate ease-in-out;
        }

        @keyframes drift {
            from { transform: translate(-10%, -10%) scale(1); }
            to { transform: translate(10%, 10%) scale(1.1); }
        }

        .card {
            background: rgba(30, 20, 40, 0.6); /* Fallback for browsers without backdrop-filter */
            background: var(--glass-bg);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            border: 1px solid var(--glass-border);
            padding: 3rem;
            border-radius: 24px;
            text-align: center;
            max-width: 480px;
            width: 90%;
            box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
        }

        .logo {
            width: 64px;
            height: 64px;
            margin-bottom: 1.5rem;
            opacity: 0.9;
        }

        h1 {
            font-size: 1.75rem;
            font-weight: 700;
            margin-bottom: 1rem;
            letter-spacing: -0.02em;
        }

        p {
            color: rgba(255, 255, 255, 0.6);
            line-height: 1.6;
            margin-bottom: 2rem;
        }

        .avg-hint {
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.45);
            margin-top: -1.25rem;
            margin-bottom: 1.75rem;
        }

        .progress-container {
            width: 100%;
            height: 6px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 999px;
            margin-bottom: 1rem;
            overflow: hidden;
            position: relative;
        }

        .progress-bar {
            height: 100%;
            background: var(--accent);
            width: 0%;
            transition: width 1s linear;
            box-shadow: 0 0 12px var(--accent);
        }

        .timer-text {
            font-size: 0.85rem;
            color: rgba(255, 255, 255, 0.4);
            margin-bottom: 2rem;
            font-variant-numeric: tabular-nums;
        }

        .status {
            font-size: 0.9rem;
            font-weight: 500;
            color: var(--accent);
            background: rgba(192, 132, 252, 0.1);
            padding: 0.5rem 1rem;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
        }

        .spinner {
            width: 18px;
            height: 18px;
            border: 2px solid rgba(255, 255, 255, 0.1);
            border-top-color: var(--accent);
            border-radius: 50%;
            display: inline-block;
            animation: spin 0.8s linear infinite;
            vertical-align: middle;
            margin-right: 10px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .footer {
            margin-top: 2rem;
            font-size: 0.75rem;
            color: rgba(255, 255, 255, 0.3);
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }
    </style>
</head>
<body>
    <div class="bg-glow"></div>
    <div class="card">
        <svg class="logo" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
            <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" stroke-width="3" opacity="0.2"/>
            <path d="M22 4C12.0589 4 4 12.0589 4 22C4 31.9411 12.0589 40 22 40" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>
        </svg>
        <h1>Echo is updating</h1>
        <p>${requestHost} is temporarily unavailable while we reconnect it. We'll be back online in just a moment.</p>
        ${
          state.historicalDowntimes.length > 0
            ? `<p class="avg-hint">Recent average recovery: ${state.avgDowntimeSeconds}s (last ${state.historicalDowntimes.length} incidents)</p>`
            : ''
        }
        
        <div class="progress-container">
            <div id="bar" class="progress-bar"></div>
        </div>
        <div class="timer-text">
            Estimated wait: <span id="timer">...</span>
        </div>

        <div class="status">
            <div class="spinner"></div>
            Reconnecting shortly
        </div>

        <div class="footer">Privacy focused. Real-time.</div>
    </div>

    <script>
        const avgDowntime = ${estimate};
        let elapsed = ${elapsed};
        
        const bar = document.getElementById('bar');
        const timer = document.getElementById('timer');

        function updateDisplay() {
            const remaining = Math.max(0, avgDowntime - elapsed);
            const percent = Math.min(100, (elapsed / avgDowntime) * 100);
            
            bar.style.width = percent + '%';
            
            if (remaining > 0) {
                timer.innerText = '~' + remaining + ' seconds';
            } else {
                timer.innerText = 'Almost there...';
                bar.style.width = '100%';
            }
        }

        setInterval(() => {
            elapsed++;
            updateDisplay();
        }, 1000);
        updateDisplay();

        // Poll the server to see when it comes back up
        let isReloading = false;
        async function attemptReconnect() {
            if (isReloading) return;
            try {
                const cacheBuster = '?t=' + Date.now();
                const [apiRes, feRes] = await Promise.all([
                    fetch('/api/v1/health' + cacheBuster, { method: 'HEAD', cache: 'no-cache' }).catch(() => ({ ok: false })),
                    fetch('/' + cacheBuster, { method: 'HEAD', cache: 'no-cache' }).catch(() => ({ ok: false }))
                ]);

                if (apiRes.ok || feRes.ok) {
                    isReloading = true;
                    window.location.reload(true);
                    return;
                }
            } catch (e) {}
            setTimeout(attemptReconnect, 2500);
        }
        setTimeout(attemptReconnect, 1000);
    </script>
</body>
</html>
`;
}

const server = http.createServer((req, res) => {
  const target = resolveTarget(req);
  const state = getTargetState(target);

  if (!state.isUp) {
    serveMaintenance(res, target, req);
    return;
  }

  // Add forwarding headers
  const headers = { ...req.headers };
  const ip = req.socket.remoteAddress;
  if (ip) {
    if (headers['x-forwarded-for']) {
      headers['x-forwarded-for'] = `${headers['x-forwarded-for']}, ${ip}`;
    } else {
      headers['x-forwarded-for'] = ip;
    }
  }

  if (!headers['x-forwarded-proto']) {
    headers['x-forwarded-proto'] = req.socket.encrypted ? 'https' : 'http';
  }
  if (!headers['x-forwarded-host']) {
    headers['x-forwarded-host'] = headers['host'];
  }

  // Proxy the request
  const proxyReq = http.request(
    {
      host: target.host,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: headers,
      timeout: 10000,
    },
    (proxyRes) => {
      // If target returns 502/503/504, it might be in a half-broken state; serve maintenance
      if (proxyRes.statusCode >= 502 && proxyRes.statusCode <= 504) {
        serveMaintenance(res, target, req);
        return;
      }
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    },
  );

  proxyReq.on('error', (err) => {
    serveMaintenance(res, target, req);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    serveMaintenance(res, target, req);
  });

  req.pipe(proxyReq, { end: true });
});

function serveMaintenance(res, target, req) {
  res.writeHead(503, {
    'Content-Type': 'text/html',
    'Retry-After': '5',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    Connection: 'close',
  });
  res.end(getMaintenanceHtml(target, req));
}

// Handle WebSocket proxying
server.on('upgrade', (req, socket, head) => {
  const target = resolveTarget(req);
  const state = getTargetState(target);
  if (!state.isUp) {
    socket.destroy();
    return;
  }

  const targetSocket = net.connect(target.port, target.host, () => {
    // Build headers for the upgrade request
    const upgradeHeaders = { ...req.headers };
    const ip = req.socket.remoteAddress;
    if (ip) {
      if (upgradeHeaders['x-forwarded-for']) {
        upgradeHeaders['x-forwarded-for'] =
          `${upgradeHeaders['x-forwarded-for']}, ${ip}`;
      } else {
        upgradeHeaders['x-forwarded-for'] = ip;
      }
    }
    if (!upgradeHeaders['x-forwarded-proto']) {
      upgradeHeaders['x-forwarded-proto'] = req.socket.encrypted
        ? 'https'
        : 'http';
    }

    // 1. Write the request line and headers first
    let rawRequest = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (const [key, value] of Object.entries(upgradeHeaders)) {
      rawRequest += `${key}: ${value}\r\n`;
    }
    rawRequest += '\r\n';
    targetSocket.write(rawRequest);

    // 2. Then write any data that was already received in the 'head' buffer
    if (head && head.length > 0) {
      targetSocket.write(head);
    }

    // 3. Finally, establish the bidirectional pipe
    targetSocket.pipe(socket);
    socket.pipe(targetSocket);
  });

  targetSocket.on('error', () => {
    socket.destroy();
  });
});

server.listen(WATCHDOG_PORT, '0.0.0.0', () => {
  console.log(`[watchdog] Proxy listening on port ${WATCHDOG_PORT}`);
  console.log(`[watchdog] Default target http://${TARGET_HOST}:${TARGET_PORT}`);
  if (hostTargets.size > 0) {
    for (const [host, target] of hostTargets.entries()) {
      console.log(
        `[watchdog] Host route ${host} -> http://${target.host}:${target.port}`,
      );
    }
  }
});
