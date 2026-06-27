import { parseBoolean } from '../envParsing';

export function envSet(name: string): boolean {
  const raw = process.env[name];
  return raw !== undefined && raw.trim() !== '';
}

export function envBool(name: string): boolean | undefined {
  if (!envSet(name)) return undefined;
  return parseBoolean(process.env[name], false);
}

export function envInt(name: string): number | undefined {
  if (!envSet(name)) return undefined;
  const n = parseInt(process.env[name]!.trim(), 10);
  return Number.isFinite(n) ? n : undefined;
}

export function envFloat(name: string): number | undefined {
  if (!envSet(name)) return undefined;
  const n = parseFloat(process.env[name]!.trim());
  return Number.isFinite(n) ? n : undefined;
}

export function envStr(name: string): string | undefined {
  if (!envSet(name)) return undefined;
  return process.env[name]!.trim();
}

export function setNested(
  root: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    if (!cur[key] || typeof cur[key] !== 'object') {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = value;
}
