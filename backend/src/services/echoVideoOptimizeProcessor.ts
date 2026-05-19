import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { config } from '../config';
import {
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  isEchoS3UploadConfigured,
} from './s3UploadPresign';
import { resolveLocalUploadFilePath } from './localUploadDisk';
import {
  markEchoVideoOptimizeDone,
  markEchoVideoOptimizeFailed,
  type VideoOptimizeJobRow,
} from './echoVideoOptimizeQueue';
import type pg from 'pg';

const execFileAsync = promisify(execFile);

const FFMPEG_TIMEOUT_MS = 900_000;

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

async function writeS3ObjectToFile(
  body: unknown,
  destPath: string,
): Promise<void> {
  if (!body || typeof body !== 'object' || !('pipe' in body)) {
    throw new Error('invalid S3 object stream');
  }
  await pipeline(
    body as NodeJS.ReadableStream,
    createWriteStream(destPath, { flags: 'w' }),
  );
}

async function runFfmpegToWebm(inPath: string, outPath: string): Promise<void> {
  const bin = ffmpegBin();
  const attempts: string[][] = [
    [
      '-i',
      inPath,
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '35',
      '-b:v',
      '0',
      '-c:a',
      'libopus',
      '-b:a',
      '96k',
      outPath,
    ],
    [
      '-i',
      inPath,
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '35',
      '-b:v',
      '0',
      '-an',
      outPath,
    ],
    [
      '-i',
      inPath,
      '-c:v',
      'libvpx',
      '-crf',
      '32',
      '-b:v',
      '0',
      '-c:a',
      'libopus',
      '-b:a',
      '96k',
      outPath,
    ],
    ['-i', inPath, '-c:v', 'libvpx', '-crf', '32', '-b:v', '0', '-an', outPath],
  ];

  let lastErr: Error | undefined;
  for (const tail of attempts) {
    try {
      await execFileAsync(
        bin,
        ['-hide_banner', '-loglevel', 'error', '-y', ...tail],
        { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      );
      return;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error('ffmpeg failed');
}

export async function processEchoVideoOptimizeJob(
  pool: pg.Pool,
  job: VideoOptimizeJobRow,
  log: {
    info: (o: unknown, m?: string) => void;
    warn: (o: unknown, m?: string) => void;
  },
): Promise<void> {
  const storageKey = job.storage_key;
  const tmpRoot = path.join(os.tmpdir(), `echo-vopt-${randomUUID()}`);
  const inPath = path.join(tmpRoot, 'in');
  const outPath = path.join(tmpRoot, 'out.webm');

  try {
    await mkdir(tmpRoot, { recursive: true });

    if (isEchoS3UploadConfigured()) {
      const client = createEchoS3UploadClient();
      const bucket = getEchoS3UploadBucket();
      if (!client || !bucket) {
        throw new Error('S3 not configured');
      }
      const obj = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
      );
      await writeS3ObjectToFile(obj.Body, inPath);
    } else if (config.echoLocalUploadDir) {
      const abs = resolveLocalUploadFilePath(storageKey);
      if (!abs) throw new Error('invalid local storage key');
      await copyFile(abs, inPath);
    } else {
      throw new Error('no upload backend');
    }

    const inStat = await stat(inPath);
    if (inStat.size < 1) throw new Error('empty source file');

    await runFfmpegToWebm(inPath, outPath);
    const outStat = await stat(outPath);
    if (outStat.size >= inStat.size * 0.98) {
      log.warn(
        { storageKey, in: inStat.size, out: outStat.size },
        'echo.video_optimize.skip_larger',
      );
      await markEchoVideoOptimizeDone(pool, job.id);
      return;
    }

    if (isEchoS3UploadConfigured()) {
      const client = createEchoS3UploadClient();
      const bucket = getEchoS3UploadBucket();
      if (!client || !bucket) throw new Error('S3 not configured');
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: storageKey,
          Body: createReadStream(outPath),
          ContentType: 'video/webm',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } else {
      const abs = resolveLocalUploadFilePath(storageKey);
      if (!abs) throw new Error('invalid local storage key');
      await mkdir(path.dirname(abs), { recursive: true });
      await copyFile(outPath, abs);
      await pool.query(
        `INSERT INTO echo_upload_served_content_type (storage_key, content_type)
         VALUES ($1, 'video/webm')
         ON CONFLICT (storage_key) DO UPDATE SET content_type = EXCLUDED.content_type`,
        [storageKey],
      );
    }

    log.info({ storageKey, bytes: outStat.size }, 'echo.video_optimize.done');
    await markEchoVideoOptimizeDone(pool, job.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn({ storageKey, err: msg }, 'echo.video_optimize.failed');
    await markEchoVideoOptimizeFailed(pool, job.id, msg);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}
