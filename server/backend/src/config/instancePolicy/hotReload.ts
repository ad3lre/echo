import * as fs from 'fs';
import * as path from 'path';
import { parseBoolean } from '../envParsing';
import type { InstancePolicySnapshot } from './loadInstancePolicy';
import {
  loadInstancePolicy,
  resolveDefaultInstancePolicyPath,
} from './loadInstancePolicy';

let snapshot: InstancePolicySnapshot | null = null;
let watcher: fs.FSWatcher | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

export function instancePolicyWatchEnabled(): boolean {
  return parseBoolean(process.env.ECHO_INSTANCE_POLICY_WATCH, false);
}

export function getInstancePolicy(): InstancePolicySnapshot {
  if (!snapshot) {
    snapshot = loadInstancePolicy();
  }
  return snapshot;
}

export function setInstancePolicyForTests(
  next: InstancePolicySnapshot | null,
): void {
  snapshot = next;
}

function isStandaloneTestEntrypoint(): boolean {
  const entry = process.argv[1] ?? '';
  return (
    entry.includes('/tests/') ||
    entry.includes('.test.') ||
    entry.endsWith('/run.ts')
  );
}

export function initInstancePolicy(): InstancePolicySnapshot {
  snapshot = loadInstancePolicy();
  if (
    instancePolicyWatchEnabled() &&
    process.env.ECHO_CONFIG_TEST_ISOLATION !== '1' &&
    !isStandaloneTestEntrypoint()
  ) {
    startInstancePolicyWatcher();
  }
  return snapshot;
}

function startInstancePolicyWatcher(): void {
  if (watcher) return;
  const filePath = resolveDefaultInstancePolicyPath();
  const watchTarget = filePath;

  try {
    if (fs.existsSync(watchTarget)) {
      watcher = fs.watch(watchTarget, () => scheduleReload());
    } else {
      watcher = fs.watch(path.dirname(watchTarget), (_event, name) => {
        if (name === path.basename(watchTarget)) scheduleReload();
      });
    }
  } catch (err) {
    console.error(
      `[instance-policy] hot reload disabled: cannot watch ${watchTarget}: ${err instanceof Error ? err.message : err}`,
    );
    return;
  }

  console.warn(`[instance-policy] watching ${watchTarget} for hot reload`);
}

function scheduleReload(): void {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    try {
      snapshot = loadInstancePolicy();
      console.warn('[instance-policy] reloaded successfully');
    } catch (err) {
      console.error(
        `[instance-policy] reload rejected: ${err instanceof Error ? err.message : err}`,
      );
    }
  }, 300);
}

export function stopInstancePolicyWatcher(): void {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = null;
  watcher?.close();
  watcher = null;
}
