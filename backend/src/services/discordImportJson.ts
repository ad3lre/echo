import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonObject;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function parseJsonObject(text: string, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in ${label}`);
  }
  const obj = asObject(parsed);
  if (!obj) throw new Error(`Expected JSON object in ${label}`);
  return obj;
}

export function parseJsonArray(text: string, label: string): JsonObject[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in ${label}`);
  }
  if (!Array.isArray(parsed))
    throw new Error(`Expected JSON array in ${label}`);
  return parsed.filter((entry): entry is JsonObject => asObject(entry) != null);
}

export async function readJsonObjectFile(
  filePath: string,
  label: string,
): Promise<JsonObject> {
  return parseJsonObject(await readFile(filePath, 'utf8'), label);
}

export async function readJsonArrayFile(
  filePath: string,
  label: string,
): Promise<JsonObject[]> {
  return parseJsonArray(await readFile(filePath, 'utf8'), label);
}

export async function readJsonlFile(
  filePath: string,
  label: string,
): Promise<JsonObject[]> {
  const rows: JsonObject[] = [];
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  try {
    for await (const line of lines) {
      lineNo += 1;
      const raw = line.trim();
      if (!raw) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`Invalid JSONL row in ${label} at line ${lineNo}`);
      }
      const obj = asObject(parsed);
      if (!obj)
        throw new Error(`Expected JSON object in ${label} at line ${lineNo}`);
      rows.push(obj);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  } finally {
    lines.close();
    stream.destroy();
  }
  return rows;
}
