import { mkdir, rename, writeFile, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.tmp`;
  const body = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(tmp, body, 'utf8');
  await rename(tmp, path);
}

/** Truncate (or create empty) a JSONL file before a fresh export run. */
export async function prepareJsonl(path: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, '', 'utf8');
}

export async function appendJsonl(path: string, line: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await appendFile(path, `${JSON.stringify(line)}\n`, 'utf8');
}

export async function writeBinary(path: string, data: Buffer): Promise<void> {
  await ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}
