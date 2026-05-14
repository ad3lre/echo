#!/usr/bin/env node
/**
 * Blue-green style production deploy for Linux VPS.
 * See docs/operations/blue-green-deployment.md
 *
 * Usage:
 *   node scripts/deploy/echo-deploy.mjs init [--force]
 *   node scripts/deploy/echo-deploy.mjs deploy
 *   node scripts/deploy/echo-deploy.mjs up
 *   node scripts/deploy/echo-deploy.mjs status
 *   node scripts/deploy/echo-deploy.mjs sync-proxy
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, spawnSync } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function repoRootFromScript() {
  return path.resolve(__dirname, '../..');
}

/**
 * systemd.env uses KEY=value (systemd-compatible). Shell `source` without `export`
 * does not pass vars to child processes — load here so `npm run deploy:up` works.
 */
function applyEnvFileContent(content) {
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    let keyPart = t.slice(0, eq).trim();
    if (keyPart.startsWith('export ')) keyPart = keyPart.slice(7).trim();
    const key = keyPart;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

function deployEnvFileCandidates() {
  const list = [];
  const explicit = process.env.ECHO_DEPLOY_ENV_FILE?.trim();
  if (explicit) list.push(path.resolve(explicit));
  const repo = repoRootFromScript();
  list.push(path.join(repo, '../echo-deploy-meta/systemd.env'));
  list.push(path.join(repo, 'echo-deploy-meta/systemd.env'));
  const root = process.env.ECHO_DEPLOY_ROOT?.trim();
  if (root) list.push(path.join(path.resolve(root), 'systemd.env'));
  return [...new Set(list)];
}

function loadDeployEnvFiles() {
  const tried = [];
  for (const p of deployEnvFileCandidates()) {
    if (!p || !fs.existsSync(p)) continue;
    tried.push(p);
    try {
      applyEnvFileContent(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      console.warn(
        '[echo-deploy] Could not read env file:',
        p,
        e?.message || e,
      );
    }
  }
  if (tried.length)
    console.log('[echo-deploy] Loaded deploy env from:', tried.join(', '));
}

function deployRoot() {
  return process.env.ECHO_DEPLOY_ROOT
    ? path.resolve(process.env.ECHO_DEPLOY_ROOT)
    : '/opt/echo';
}

function portBlue() {
  const n = parseInt(process.env.ECHO_DEPLOY_PORT_BLUE || '3000', 10);
  return Number.isFinite(n) ? n : 3000;
}

function portGreen() {
  const n = parseInt(process.env.ECHO_DEPLOY_PORT_GREEN || '3010', 10);
  return Number.isFinite(n) ? n : 3010;
}

function portForSlot(slot) {
  return slot === 'blue' ? portBlue() : portGreen();
}

function proxySnippetPath() {
  const root = deployRoot();
  return process.env.ECHO_DEPLOY_PROXY_SNIPPET
    ? path.resolve(process.env.ECHO_DEPLOY_PROXY_SNIPPET)
    : path.join(root, 'proxy', 'echo-generated-routes.caddyfile');
}

function proxyReloadCmd() {
  return process.env.ECHO_DEPLOY_PROXY_RELOAD || 'sudo systemctl reload caddy';
}

function healthPath() {
  return process.env.ECHO_DEPLOY_HEALTH_PATH || '/api/v1/health';
}

function healthTimeoutMs() {
  const n = parseInt(process.env.ECHO_DEPLOY_HEALTH_TIMEOUT_MS || '120000', 10);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

/** Optional stable path for Caddy `root` → active release (ln -sfn $release $link). */
function publicRootSymlink() {
  return process.env.ECHO_DEPLOY_PUBLIC_ROOT_SYMLINK?.trim() || '';
}

function updatePublicSymlink(releaseRoot) {
  const link = publicRootSymlink();
  if (!link) return;
  const abs = path.resolve(releaseRoot);
  try {
    fs.unlinkSync(link);
  } catch {
    /* absent */
  }
  fs.symlinkSync(abs, link);
  console.log('[echo-deploy] Active release symlink:', link, '->', abs);
}

/** One Twemoji WebP + fingerprint cache shared by both release checkouts (blue/green). */
function sharedTwemojiPath() {
  const override = process.env.ECHO_DEPLOY_SHARED_TWEMOJI?.trim();
  if (override) return path.resolve(override);
  return path.join(deployRoot(), 'shared', 'twemoji');
}

function webpCountInDir(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.webp')) n++;
  }
  return n;
}

/**
 * Blue/green each have their own git clone; without this, the idle slot often has no
 * twemoji fingerprint and `npm run build` reconverts all SVGs every deploy.
 * Symlink idle `frontend/public/twemoji` → $ECHO_DEPLOY_ROOT/shared/twemoji (override:
 * ECHO_DEPLOY_SHARED_TWEMOJI) so incremental copy-twemoji.js sees the same cache.
 */
function ensureSharedTwemojiSymlink(idleRoot) {
  if (process.platform !== 'linux') return;
  const shared = sharedTwemojiPath();
  const linkPath = path.join(idleRoot, 'frontend/public/twemoji');
  fs.mkdirSync(shared, { recursive: true });
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });

  const sharedReady =
    fs.existsSync(path.join(shared, '.echo-twemoji-fingerprint.json')) ||
    webpCountInDir(shared) > 0;

  let st;
  try {
    st = fs.lstatSync(linkPath);
  } catch {
    st = null;
  }

  if (st?.isSymbolicLink()) {
    try {
      if (fs.realpathSync(linkPath) === fs.realpathSync(shared)) {
        console.log('[echo-deploy] Twemoji shared cache:', shared);
        return;
      }
    } catch {
      /* broken symlink */
    }
    fs.unlinkSync(linkPath);
  } else if (st?.isDirectory()) {
    if (!sharedReady && webpCountInDir(linkPath) > 0) {
      console.log(
        '[echo-deploy] Seeding shared Twemoji cache from idle checkout (one-time)',
      );
      fs.cpSync(linkPath, shared, { recursive: true });
    }
    fs.rmSync(linkPath, { recursive: true, force: true });
  }

  fs.symlinkSync(shared, linkPath);
  console.log(
    '[echo-deploy] Twemoji -> shared cache symlink:',
    linkPath,
    '->',
    shared,
  );
}

function statePath() {
  return path.join(deployRoot(), 'state.json');
}

function releasePath(slot) {
  const envKey =
    slot === 'blue' ? 'ECHO_DEPLOY_RELEASE_BLUE' : 'ECHO_DEPLOY_RELEASE_GREEN';
  const override = process.env[envKey]?.trim();
  if (override) return path.resolve(override);
  return path.join(deployRoot(), 'releases', slot);
}

function pidFilePath(releaseRoot) {
  return path.join(releaseRoot, 'logs', 'deploy-api.pid');
}

function loadState() {
  const p = statePath();
  if (!fs.existsSync(p)) {
    return { activeSlot: 'blue', version: 1 };
  }
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.activeSlot !== 'blue' && j.activeSlot !== 'green') {
      throw new Error('invalid activeSlot');
    }
    return { activeSlot: j.activeSlot, version: j.version ?? 1 };
  } catch {
    throw new Error(`Invalid or unreadable state: ${p}`);
  }
}

function saveState(state) {
  const root = deployRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function otherSlot(slot) {
  return slot === 'blue' ? 'green' : 'blue';
}

function assertLinuxOrAllow() {
  if (process.platform === 'linux') return;
  if (process.env.ECHO_DEPLOY_ALLOW_NON_LINUX === '1') {
    console.warn(
      '[echo-deploy] ECHO_DEPLOY_ALLOW_NON_LINUX=1: continuing without Linux-only guarantees.',
    );
    return;
  }
  console.error(
    '[echo-deploy] Production deploy is intended for Linux. Set ECHO_DEPLOY_ALLOW_NON_LINUX=1 to run build/health locally (no proxy snippet flip).',
  );
  process.exit(1);
}

function runNpm(cwd, args, inherit = false) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  // Do not force NODE_ENV=production for ci/build — workspaces need devDependencies to compile.
  const r = spawnSync(npm, args, {
    cwd,
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
    env: { ...process.env },
  });
  if (r.status !== 0) {
    const err = r.stderr || r.stdout || '';
    throw new Error(
      `npm ${args.join(' ')} failed in ${cwd}: ${err.slice(-4000)}`,
    );
  }
}

function parseDotenvFile(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map.set(key, val);
  }
  return map;
}

function parseLiveKitYamlKeys(filePath) {
  if (!fs.existsSync(filePath)) return new Map();
  const map = new Map();
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  let inKeysBlock = false;
  for (const line of lines) {
    if (!inKeysBlock) {
      if (/^\s*keys:\s*$/.test(line)) inKeysBlock = true;
      continue;
    }
    if (/^\S/.test(line)) break;
    const m = line.match(/^\s{2,}([A-Za-z0-9._-]+)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1]?.trim();
    const secret = m[2]?.trim().replace(/^['"]|['"]$/g, '');
    if (!key || !secret) continue;
    map.set(key, secret);
  }
  return map;
}

/**
 * Prevent silent voice breakage: Echo API token keypair must match mounted LiveKit YAML keys.
 * Fail deploy early with a concrete message instead of shipping tokens that `/rtc/v1/validate` rejects.
 */
function assertLiveKitEnvMatchesYamlOrThrow(releaseRoot) {
  const envPath = path.join(releaseRoot, '.env');
  const yamlPath = path.join(releaseRoot, 'infra', 'livekit', 'livekit.yaml');
  if (!fs.existsSync(envPath) || !fs.existsSync(yamlPath)) return;
  const env = parseDotenvFile(envPath);
  const apiKey = env.get('LIVEKIT_API_KEY')?.trim() || '';
  const apiSecret = env.get('LIVEKIT_API_SECRET')?.trim() || '';
  if (!apiKey || !apiSecret) return;
  const yamlKeys = parseLiveKitYamlKeys(yamlPath);
  if (yamlKeys.size === 0) return;
  const yamlSecret = yamlKeys.get(apiKey);
  if (!yamlSecret) {
    throw new Error(
      `LiveKit key mismatch in ${releaseRoot}: .env LIVEKIT_API_KEY=${apiKey} is not present in infra/livekit/livekit.yaml keys block.`,
    );
  }
  if (yamlSecret !== apiSecret) {
    throw new Error(
      `LiveKit secret mismatch in ${releaseRoot}: .env LIVEKIT_API_SECRET does not match infra/livekit/livekit.yaml keys.${apiKey}. Update one source of truth before deploy.`,
    );
  }
}

function runGitPull(releaseRoot) {
  const gitDir = path.join(releaseRoot, '.git');
  if (!fs.existsSync(gitDir)) {
    console.warn('[echo-deploy] No .git in release; skipping git pull');
    return;
  }
  const r = spawnSync('git', ['-C', releaseRoot, 'pull', '--ff-only'], {
    stdio: 'inherit',
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`git pull --ff-only failed in ${releaseRoot}`);
  }
}

function readPid(releaseRoot) {
  const f = pidFilePath(releaseRoot);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const pid = typeof j.pid === 'number' ? j.pid : parseInt(j.pid, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function writePid(releaseRoot, pid) {
  const dir = path.join(releaseRoot, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    pidFilePath(releaseRoot),
    `${JSON.stringify({ pid })}\n`,
    'utf8',
  );
}

function clearPid(releaseRoot) {
  try {
    fs.unlinkSync(pidFilePath(releaseRoot));
  } catch {
    /* absent */
  }
}

async function loadTreeKill() {
  try {
    const mod = await import('tree-kill');
    return mod.default;
  } catch {
    return null;
  }
}

/**
 * Free TCP port(s) the same way as `npm run prod:serve` (`scripts/kill-dev-ports.js` + ECHO_FREE_PORTS).
 * Only pass the **idle** deploy port(s) here — never the live slot port while it serves traffic.
 */
function runKillDevPorts(releaseRoot, portsCsv) {
  const script = path.join(releaseRoot, 'scripts', 'kill-dev-ports.js');
  if (!fs.existsSync(script)) {
    console.warn(
      '[echo-deploy] scripts/kill-dev-ports.js missing; skipping port free:',
      portsCsv,
    );
    return;
  }
  const r = spawnSync(process.execPath, [script], {
    cwd: releaseRoot,
    stdio: 'inherit',
    env: { ...process.env, ECHO_FREE_PORTS: portsCsv },
  });
  if (r.status !== 0) {
    throw new Error(
      `kill-dev-ports failed for ECHO_FREE_PORTS=${portsCsv} (exit ${r.status}). Install lsof on Linux or see scripts/kill-dev-ports.js.`,
    );
  }
  console.log('[echo-deploy] Freed port(s):', portsCsv);
}

async function stopApi(releaseRoot, label) {
  const pid = readPid(releaseRoot);
  if (pid == null) {
    console.log(`[echo-deploy] No saved API pid for ${label}; nothing to stop`);
    return;
  }
  const treeKill = await loadTreeKill();
  await new Promise((resolve) => {
    if (treeKill) {
      treeKill(pid, 'SIGTERM', () => resolve());
    } else {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* ESRCH */
      }
      resolve();
    }
  });
  await delay(1500);
  clearPid(releaseRoot);
}

function backendEntry(releaseRoot) {
  return path.join(
    releaseRoot,
    'backend',
    'dist',
    'backend',
    'src',
    'index.js',
  );
}

async function startApi(releaseRoot, port) {
  const entry = backendEntry(releaseRoot);
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Backend bundle missing: ${entry} (run npm run build first)`,
    );
  }
  const logsDir = path.join(releaseRoot, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const outFd = fs.openSync(path.join(logsDir, 'deploy-api.stdout.log'), 'a');
  const errFd = fs.openSync(path.join(logsDir, 'deploy-api.stderr.log'), 'a');
  const envFile = path.join(releaseRoot, '.env');
  const args = [];
  if (fs.existsSync(envFile)) {
    args.push('--env-file', envFile);
  }
  args.push(entry);
  const child = spawn(process.execPath, args, {
    cwd: releaseRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: process.env.HOST || '0.0.0.0',
    },
    detached: true,
    stdio: ['ignore', outFd, errFd],
  });
  child.unref();
  if (!child.pid) throw new Error('Failed to spawn API process');
  writePid(releaseRoot, child.pid);
  console.log(
    `[echo-deploy] Started API pid=${child.pid} port=${port} logs=${logsDir}`,
  );
}

async function waitForHealth(port) {
  const url = `http://127.0.0.1:${port}${healthPath()}`;
  const deadline = Date.now() + healthTimeoutMs();
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        console.log('[echo-deploy] Health OK:', url);
        return;
      }
    } catch {
      /* still starting */
    }
    await delay(500);
  }
  throw new Error(`Health check failed: ${url}`);
}

function renderProxySnippet(port, releaseRoot) {
  const tplPath = path.join(
    __dirname,
    'templates',
    'caddy-echo-routes.caddyfile.template',
  );
  const tpl = fs.readFileSync(tplPath, 'utf8');
  return tpl
    .replace(/\{\{API_PORT\}\}/g, String(port))
    .replace(/\{\{RELEASE_ROOT\}\}/g, releaseRoot.replace(/\\/g, '/'));
}

function writeProxySnippetAndReload(port, releaseRoot) {
  const outPath = proxySnippetPath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const body = renderProxySnippet(port, releaseRoot);
  fs.writeFileSync(outPath, body, 'utf8');
  console.log('[echo-deploy] Wrote', outPath);
  const cmd = proxyReloadCmd();
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`Proxy reload failed (${cmd}), status=${r.status}`);
  }
  console.log('[echo-deploy] Proxy reload:', cmd);
}

function cmdInit(force) {
  const root = deployRoot();
  fs.mkdirSync(path.join(root, 'proxy'), { recursive: true });
  fs.mkdirSync(path.join(root, 'releases'), { recursive: true });
  const sp = statePath();
  if (fs.existsSync(sp) && !force) {
    console.error('[echo-deploy] state.json exists; use --force to re-init');
    process.exit(1);
  }
  saveState({ activeSlot: 'blue', version: 1 });
  const blueRoot = releasePath('blue');
  const snippet = renderProxySnippet(portBlue(), blueRoot);
  const outPath = proxySnippetPath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, snippet, 'utf8');
  updatePublicSymlink(blueRoot);
  console.log('[echo-deploy] init: wrote', sp);
  console.log('[echo-deploy] init: wrote', outPath);
  console.log(
    '[echo-deploy] Ensure full git checkouts exist at:\n  ',
    releasePath('blue'),
    '\n  ',
    releasePath('green'),
  );
  console.log(
    '[echo-deploy] Then `import` that snippet from your Caddyfile and set ECHO_DEPLOY_PROXY_RELOAD (default: sudo systemctl reload caddy).',
  );
}

function cmdStatus() {
  const st = fs.existsSync(statePath()) ? loadState() : null;
  console.log(
    JSON.stringify(
      {
        deployRoot: deployRoot(),
        state: st,
        ports: { blue: portBlue(), green: portGreen() },
        proxySnippet: proxySnippetPath(),
      },
      null,
      2,
    ),
  );
}

/**
 * Rewrite the Caddy snippet from `state.json` (active slot → port + release root) and reload.
 * Use when the proxy drifted from state (e.g. manual edits, partial deploy) and the API is
 * already running on the active port.
 */
function cmdSyncProxy() {
  const state = loadState();
  const activeSlot = state.activeSlot;
  const activeRoot = releasePath(activeSlot);
  const activePort = portForSlot(activeSlot);
  console.log(
    `[echo-deploy] sync-proxy: active=${activeSlot} port=${activePort} root=${activeRoot}`,
  );
  updatePublicSymlink(activeRoot);
  if (process.env.ECHO_DEPLOY_ALLOW_NON_LINUX === '1') {
    const outPath = proxySnippetPath();
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(
      outPath,
      renderProxySnippet(activePort, activeRoot),
      'utf8',
    );
    console.log(
      '[echo-deploy] Wrote',
      outPath,
      '(skipped reload: ECHO_DEPLOY_ALLOW_NON_LINUX=1)',
    );
    return;
  }
  writeProxySnippetAndReload(activePort, activeRoot);
}

async function cmdDeploy(doPull) {
  assertLinuxOrAllow();
  const state = loadState();
  const activeSlot = state.activeSlot;
  const idleSlot = otherSlot(activeSlot);
  const activeRoot = releasePath(activeSlot);
  const idleRoot = releasePath(idleSlot);
  const idlePort = portForSlot(idleSlot);

  for (const p of [activeRoot, idleRoot]) {
    if (!fs.existsSync(path.join(p, 'package.json'))) {
      const root = deployRoot();
      throw new Error(
        [
          `Missing package.json — not a release checkout: ${p}`,
          '',
          'Blue-green deploy needs two full git clones (each with package.json at root). Defaults:',
          `  ${path.join(root, 'releases', 'blue')}`,
          `  ${path.join(root, 'releases', 'green')}`,
          '',
          'Create them (see docs/operations/blue-green-deployment.md), or set absolute paths:',
          '  ECHO_DEPLOY_RELEASE_BLUE=/path/to/blue-checkout',
          '  ECHO_DEPLOY_RELEASE_GREEN=/path/to/green-checkout',
          '',
          '`ECHO_DEPLOY_ROOT` only sets the parent of releases/<slot> when the overrides above are unset (default root: /opt/echo).',
        ].join('\n'),
      );
    }
  }

  console.log(`[echo-deploy] Active=${activeSlot} (${activeRoot})`);
  console.log(
    `[echo-deploy] Building idle=${idleSlot} (${idleRoot}) port=${idlePort}`,
  );

  /** After Caddy points at the idle port, that process is production — do not tear it down on error. */
  let idleIsLive = false;

  try {
    if (doPull) runGitPull(idleRoot);
    assertLiveKitEnvMatchesYamlOrThrow(idleRoot);

    runNpm(
      idleRoot,
      process.platform === 'win32' ? ['ci'] : ['ci', '--force'],
      true,
    );
    ensureSharedTwemojiSymlink(idleRoot);
    runNpm(idleRoot, ['run', 'build'], true);

    await stopApi(idleRoot, idleSlot);
    runKillDevPorts(idleRoot, String(idlePort));
    await startApi(idleRoot, idlePort);
    await waitForHealth(idlePort);

    if (process.env.ECHO_DEPLOY_ALLOW_NON_LINUX === '1') {
      console.warn(
        '[echo-deploy] Skipping proxy snippet write + reload, stopping idle API, and state update (ECHO_DEPLOY_ALLOW_NON_LINUX=1 smoke only).',
      );
      await stopApi(idleRoot, idleSlot);
      return;
    }

    writeProxySnippetAndReload(idlePort, idleRoot);
    updatePublicSymlink(idleRoot);
    idleIsLive = true;

    await stopApi(activeRoot, activeSlot);

    saveState({ ...state, activeSlot: idleSlot });
    console.log(
      `[echo-deploy] Cutover complete. Active slot is now ${idleSlot}`,
    );
  } catch (e) {
    if (!idleIsLive) {
      console.error(
        '[echo-deploy] Deploy failed before cutover; stopping candidate API so the active slot keeps serving.',
      );
      await stopApi(idleRoot, idleSlot);
    } else {
      console.error(
        '[echo-deploy] Cutover may be partial (proxy updated). Check Caddy, state.json, and running API pids.',
      );
    }
    throw e;
  }
}

const argv = process.argv.slice(2);
const forceInit = argv.includes('--force');
const sub = argv.find((a) => !a.startsWith('-')) || 'help';

async function main() {
  try {
    loadDeployEnvFiles();
    if (sub === 'init') {
      cmdInit(forceInit);
    } else if (sub === 'status') {
      cmdStatus();
    } else if (sub === 'sync-proxy') {
      cmdSyncProxy();
    } else if (sub === 'deploy') {
      await cmdDeploy(false);
    } else if (sub === 'up') {
      await cmdDeploy(true);
    } else {
      console.log(`Usage: node scripts/deploy/echo-deploy.mjs <init|deploy|up|status|sync-proxy> [--force]

Environment:
  ECHO_DEPLOY_ENV_FILE      optional absolute path to systemd.env-style file (KEY=value)
  ECHO_DEPLOY_ROOT          default /opt/echo (parent of releases/blue|green unless overridden)
  ECHO_DEPLOY_RELEASE_BLUE  optional absolute path to blue slot checkout (overrides $ROOT/releases/blue)
  ECHO_DEPLOY_RELEASE_GREEN optional absolute path to green slot checkout (overrides $ROOT/releases/green)
  ECHO_DEPLOY_PROXY_SNIPPET default $ROOT/proxy/echo-generated-routes.caddyfile
  ECHO_DEPLOY_PROXY_RELOAD  default "sudo systemctl reload caddy"
  ECHO_DEPLOY_PORT_BLUE     default 3000
  ECHO_DEPLOY_PORT_GREEN    default 3010
  ECHO_DEPLOY_ALLOW_NON_LINUX=1  allow build/health on dev OS (skips proxy snippet + reload)
  ECHO_DEPLOY_PUBLIC_ROOT_SYMLINK  optional: path to a symlink updated to the active release (Caddy root)
  ECHO_DEPLOY_SHARED_TWEMOJI  optional: absolute path to shared Twemoji WebP dir (default: $ROOT/shared/twemoji)

Twemoji: idle checkout symlinks frontend/public/twemoji -> $ECHO_DEPLOY_ROOT/shared/twemoji
  (override: ECHO_DEPLOY_SHARED_TWEMOJI=/abs/path) so blue/green share one cache and
  copy-twemoji.js usually hits the fast path. scripts/copy-twemoji.js also supports
  ECHO_SKIP_TWEMOJI_COPY=1 for strict skip-only mode.
`);
      process.exit(sub === 'help' ? 0 : 1);
    }
  } catch (e) {
    console.error('[echo-deploy]', e?.message || e);
    process.exit(1);
  }
}

await main();
