import { spawnSync } from 'node:child_process';

/** Anchor container for discovering an existing Compose project on this host. */
export const ECHO_COMPOSE_ANCHOR_CONTAINER = 'echo-postgres';

const DEFAULT_PROJECT = 'echo';

/**
 * Stable Compose project for Echo infra. Services use fixed `container_name`s
 * (`echo-postgres`, …), so every clone/worktree must target the same project
 * or `docker compose up` tries to recreate containers and fails with a name conflict.
 *
 * Resolution order:
 * 1. `COMPOSE_PROJECT_NAME` env (or `.env` loaded by compose.mjs)
 * 2. Existing anchor container's `com.docker.compose.project` label
 * 3. `echo`
 */
export function resolveComposeProjectName(env = process.env) {
  const explicit = env.COMPOSE_PROJECT_NAME?.trim();
  if (explicit) return explicit;

  const inspected = spawnSync(
    'docker',
    [
      'inspect',
      '-f',
      '{{index .Config.Labels "com.docker.compose.project"}}',
      ECHO_COMPOSE_ANCHOR_CONTAINER,
    ],
    { encoding: 'utf8' },
  );
  if (inspected.status === 0) {
    const project = inspected.stdout.trim();
    if (project) return project;
  }

  return DEFAULT_PROJECT;
}
