#!/usr/bin/env node
/**
 * Postgres backup upload script - daily dumps to S3/R2 bucket.
 *
 * Design:
 * - Uses write-only credentials (no read/list/delete permissions required)
 * - Uploads to daily/ and weekly/ prefixes
 * - Weekly copy is made on Sundays by uploading same file twice with different keys
 *
 * Env (from /etc/echo/backup-upload.env):
 *   DATABASE_URL              - Postgres connection string
 *   ECHO_BACKUP_S3_BUCKET     - Target bucket name
 *   ECHO_BACKUP_S3_ENDPOINT   - S3/R2 endpoint (e.g. https://<account>.r2.cloudflarestorage.com)
 *   ECHO_BACKUP_S3_ACCESS_KEY - Write-only access key
 *   ECHO_BACKUP_S3_SECRET_KEY - Write-only secret
 *   ECHO_BACKUP_S3_PREFIX     - Optional prefix (default: "postgres")
 *   ECHO_BACKUP_TMP_DIR       - Optional temp dir (default: /tmp)
 *
 * Prerequisites:
 *   - pg_dump (postgresql-client)
 *   - aws cli v2 (aws s3 cp)
 */

import { spawn } from 'child_process';
import { mkdtemp, writeFile, chmod, unlink, rmdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const REQUIRED_ENV = [
  'DATABASE_URL',
  'ECHO_BACKUP_S3_BUCKET',
  'ECHO_BACKUP_S3_ENDPOINT',
  'ECHO_BACKUP_S3_ACCESS_KEY',
  'ECHO_BACKUP_S3_SECRET_KEY',
];

function log(level, msg, extra = {}) {
  const entry = { ts: new Date().toISOString(), level, msg, ...extra };
  console.log(JSON.stringify(entry));
}

function checkEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    log('error', 'Missing required environment variables', { missing });
    process.exit(1);
  }
}

function execPromise(command, args, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { env });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Process exited ${code}: ${stderr}`));
    });
    proc.on('error', reject);
  });
}

async function runPgDump(tempDir) {
  const dumpPath = join(tempDir, 'echo-backup.dump');
  const dbUrl = process.env.DATABASE_URL;

  log('info', 'Starting pg_dump', { dest: dumpPath });

  try {
    await execPromise(
      'pg_dump',
      [
        '-Fc', // Custom format (compressed)
        '-Z',
        '9', // Max compression
        '-v', // Verbose (goes to stderr, captured)
        '-f',
        dumpPath,
        dbUrl,
      ],
      { ...process.env, PGPASSWORD: undefined },
    ); // pg_dump extracts password from URL

    log('info', 'pg_dump completed');
    return dumpPath;
  } catch (err) {
    log('error', 'pg_dump failed', { error: err.message });
    throw err;
  }
}

async function uploadToS3(localPath, remoteKey) {
  const bucket = process.env.ECHO_BACKUP_S3_BUCKET;
  const endpoint = process.env.ECHO_BACKUP_S3_ENDPOINT;
  const accessKey = process.env.ECHO_BACKUP_S3_ACCESS_KEY;
  const secretKey = process.env.ECHO_BACKUP_S3_SECRET_KEY;

  const s3Uri = `s3://${bucket}/${remoteKey}`;

  log('info', 'Uploading to S3', { local: localPath, remote: s3Uri });

  const env = {
    ...process.env,
    AWS_ACCESS_KEY_ID: accessKey,
    AWS_SECRET_ACCESS_KEY: secretKey,
    AWS_DEFAULT_REGION: 'auto', // R2 compatibility
  };

  try {
    await execPromise(
      'aws',
      [
        's3',
        'cp',
        localPath,
        s3Uri,
        '--endpoint-url',
        endpoint,
        '--storage-class',
        'STANDARD',
      ],
      env,
    );

    log('info', 'Upload completed', { key: remoteKey });
  } catch (err) {
    log('error', 'Upload failed', { key: remoteKey, error: err.message });
    throw err;
  }
}

async function main() {
  log('info', 'Echo backup upload starting');

  checkEnv();

  const prefix = (process.env.ECHO_BACKUP_S3_PREFIX || 'postgres').replace(
    /^\/+|\/+$/g,
    '',
  );
  const tmpBase = process.env.ECHO_BACKUP_TMP_DIR || tmpdir();

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const isSunday = today.getDay() === 0;

  let tempDir = null;
  let dumpPath = null;

  try {
    // Create secure temp directory
    tempDir = await mkdtemp(join(tmpBase, 'echo-backup-'));
    await chmod(tempDir, 0o700);

    // Run backup
    dumpPath = await runPgDump(tempDir);

    // Upload to daily/
    const dailyKey = `${prefix}/daily/${dateStr}.dump`;
    await uploadToS3(dumpPath, dailyKey);

    // On Sunday, also upload to weekly/
    if (isSunday) {
      const weeklyKey = `${prefix}/weekly/${dateStr}.dump`;
      await uploadToS3(dumpPath, weeklyKey);
      log('info', 'Weekly backup created (Sunday)', { key: weeklyKey });
    }

    log('info', 'Backup upload completed successfully', {
      date: dateStr,
      isSunday,
      dailyKey,
    });
  } catch (err) {
    log('error', 'Backup failed', { error: err.message });
    process.exit(1);
  } finally {
    // Cleanup
    try {
      if (dumpPath) await unlink(dumpPath);
      if (tempDir) await rmdir(tempDir);
    } catch (cleanupErr) {
      log('warn', 'Cleanup warning (non-fatal)', { error: cleanupErr.message });
    }
  }
}

main();
