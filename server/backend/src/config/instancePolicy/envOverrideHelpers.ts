export function envSet(name: string): boolean {
  const raw = process.env[name];
  return raw !== undefined && raw.trim() !== '';
}

export function envBool(name: string): boolean | undefined {
  if (!envSet(name)) return undefined;
  const raw = process.env[name]!.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(
    `${name} must be one of true, false, 1, 0, yes, no, on, or off`,
  );
}

export function envInt(name: string): number | undefined {
  if (!envSet(name)) return undefined;
  const raw = process.env[name]!.trim();
  if (!/^[+-]?\d+$/.test(raw)) {
    throw new Error(`${name} must be a whole number`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n))
    throw new Error(`${name} must be a safe integer`);
  return n;
}

export function envFloat(name: string): number | undefined {
  if (!envSet(name)) return undefined;
  const n = Number(process.env[name]!.trim());
  if (!Number.isFinite(n)) throw new Error(`${name} must be a finite number`);
  return n;
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
