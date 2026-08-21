import * as fs from 'fs';
import * as path from 'path';
import {
  deepMergeInstancePolicy,
  DEFAULT_INSTANCE_POLICY,
  type InstancePolicy,
} from '../../../../../contracts/instancePolicy';
import { buildInstancePolicyEnvOverrides } from './envOverrides';
import { validateInstancePolicy } from './validateInstancePolicy';

export type InstancePolicySnapshot = Readonly<InstancePolicy>;

export function resolveDefaultInstancePolicyPath(): string {
  const fromEnv = process.env.ECHO_INSTANCE_POLICY_PATH?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(process.cwd(), fromEnv);
  }
  return path.resolve(process.cwd(), 'echo.instance.json');
}

export function readInstancePolicyFile(
  filePath: string,
): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error('root must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to parse instance policy at ${filePath}: ${detail}`,
    );
  }
}

export type LoadInstancePolicyOptions = {
  filePath?: string;
  isProduction?: boolean;
  turnstileSecretConfigured?: boolean;
};

export function loadInstancePolicy(
  opts: LoadInstancePolicyOptions = {},
): InstancePolicySnapshot {
  const isProduction =
    opts.isProduction ??
    (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  const filePath = opts.filePath ?? resolveDefaultInstancePolicyPath();
  const fileJson = readInstancePolicyFile(filePath);
  const fromFile = fileJson
    ? deepMergeInstancePolicy(DEFAULT_INSTANCE_POLICY, fileJson)
    : DEFAULT_INSTANCE_POLICY;
  const envOverrides = buildInstancePolicyEnvOverrides(isProduction);
  const merged = deepMergeInstancePolicy(fromFile, envOverrides);

  if (
    !process.env.ECHO_DISCORD_IMPORT_MAX_PER_USER_PER_DAY?.trim() &&
    !fileJson?.limits
  ) {
    merged.limits.upstream.discordImport.maxMetadataStartsPerUserPerDay =
      isProduction ? 3 : 0;
  }

  const turnstileSecretConfigured =
    opts.turnstileSecretConfigured ??
    Boolean(process.env.ECHO_TURNSTILE_SECRET_KEY?.trim());

  validateInstancePolicy(merged, {
    isProduction,
    turnstileSecretConfigured,
  });

  return Object.freeze(
    JSON.parse(JSON.stringify(merged)) as InstancePolicy,
  ) as InstancePolicySnapshot;
}
