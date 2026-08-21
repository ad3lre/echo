import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const INPUT_TOKEN = 'INPUT_PATH';

/**
 * Runs a host-provided scanner (for example licensed PhotoDNA CLI) on a temp copy of the bytes.
 * Contract: exit code **0** = pass, **2** = policy match, any other exit or timeout = error.
 * Stdout is ignored unless you encode signals there; prefer exit codes.
 */
export async function runExternalCsamScanCmd(opts: {
  argvTemplate: string[];
  inputBytes: Buffer;
  timeoutMs: number;
}): Promise<'pass' | 'match' | 'error'> {
  if (opts.argvTemplate.length < 1) return 'error';
  const tmpRoot = path.join(os.tmpdir(), `echo-csam-${randomUUID()}`);
  const inputPath = path.join(tmpRoot, 'in');
  try {
    await mkdir(tmpRoot, { recursive: true });
    await writeFile(inputPath, opts.inputBytes);
    const argv = opts.argvTemplate.map((a) =>
      a.replaceAll(INPUT_TOKEN, inputPath),
    );
    const bin = argv[0]!;
    const args = argv.slice(1);
    try {
      await execFileAsync(bin, args, {
        timeout: opts.timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
      });
      return 'pass';
    } catch (e: unknown) {
      const rawCode =
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (typeof (e as { code: unknown }).code === 'number' ||
          typeof (e as { code: unknown }).code === 'string')
          ? (e as { code: number | string }).code
          : undefined;
      const code =
        typeof rawCode === 'number'
          ? rawCode
          : typeof rawCode === 'string'
            ? parseInt(rawCode, 10)
            : NaN;
      if (code === 2) return 'match';
      return 'error';
    }
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}
