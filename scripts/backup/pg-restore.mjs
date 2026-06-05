#!/usr/bin/env node
/**
 * Postgres restore script - download from S3/R2 and restore.
 *
 * Design:
 * - Requires root/sudo to run (hard take)
 * - Uses separate read credentials from /etc/echo/backup-restore.env
 * - Downloads dump to temp file, runs pg_restore
 *
 * Usage:
 *   sudo -E npm run backup:postgres:restore -- --date 2026-06-05 --tier daily
 *   sudo -E npm run backup:postgres:restore -- --date 2026-06-05 --tier daily --target-database-url postgres://...
 *
 * Env (from /etc/echo/backup-restore.env or inherited):
 *   ECHO_BACKUP_S3_BUCKET       - Source bucket name
 *   ECHO_BACKUP_S3_ENDPOINT     - S3/R2 endpoint
 *   ECHO_BACKUP_S3_ACCESS_KEY   - Read-capable access key
 *   ECHO_BACKUP_S3_SECRET_KEY   - Read-capable secret
 *   ECHO_BACKUP_S3_PREFIX       - Optional prefix (default: "postgres")
 *   DATABASE_URL                - Default target database for restore (override with --target-database-url)
 *
 * Prerequisites:
 *   - pg_restore (postgresql-client)
 *   - aws cli v2 (aws s3 cp)
 */

import { spawn } from 'child_process';
import { mkdtemp, writeFile, chmod, unlink, rmdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const RESTORE_ENV_PATH = '/etc/echo/backup-restore.env';

function log(level, msg, extra = {}) {
  const entry = { ts: new Date().toISOString(), level, msg, ...extra };
  console.log(JSON.stringify(entry));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--date' && args[i + 1]) {
      parsed.date = args[i + 1];
      i++;
    } else if (arg === '--tier' && args[i + 1]) {
      parsed.tier = args[i + 1];
      i++;
    } else if (arg === '--target-database-url' && args[i + 1]) {
      parsed.targetDbUrl = args[i + 1];
      i++;
    } else if (arg === '--help') {
      parsed.help = true;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`
Echo Postgres Restore - Hard Take (requires sudo)

Usage:
  sudo -E npm run backup:postgres:restore -- [options]

Options:
  --date YYYY-MM-DD          Date of backup to restore (required)
  --tier daily|weekly        Backup tier to use (default: daily)
  --target-database-url URL  Target database URL (default: DATABASE_URL from env)
  --help                     Show this help

Environment:
  Credentials are read from /etc/echo/backup-restore.env (root-only file)
  or inherited with -E flag to sudo.

Examples:
  sudo -E npm run backup:postgres:restore -- --date 2026-06-05
  sudo -E npm run backup:postgres:restore -- --date 2026-06-05 --tier weekly --target-database-url postgres://restoreuser:pass@localhost/echo_scratch
`);
}

function checkSudo() {
  const uid = process.getuid ? process.getuid() : -1;
  if (uid !== 0) {
    log('error', 'Restore requires root/sudo privileges');
    console.error(
      '\nThis script must run with sudo for the "hard take" security model.',
    );
    console.error(
      'Run with: sudo -E npm run backup:postgres:restore -- [options]',
    );
    process.exit(1);
  }
}

function checkEnv() {
  const required = [
    'ECHO_BACKUP_S3_BUCKET',
    'ECHO_BACKUP_S3_ENDPOINT',
    'ECHO_BACKUP_S3_ACCESS_KEY',
    'ECHO_BACKUP_S3_SECRET_KEY',
  ];

  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    log('error', 'Missing required environment variables', { missing });
    console.error(
      '\nCreate /etc/echo/backup-restore.env with read-capable S3 credentials.',
    );
    console.error('See docs/operations/runbooks/backup-restore.md');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL && !parsedArgs.targetDbUrl) {
    log('error', 'No target database URL specified');
    console.error(
      'Set DATABASE_URL in environment or use --target-database-url',
    );
    process.exit(1);
  }
}

function execPromise(command, args, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
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

async function downloadFromS3(remoteKey, localPath) {
  const bucket = process.env.ECHO_BACKUP_S3_BUCKET;
  const endpoint = process.env.ECHO_BACKUP_S3_ENDPOINT;
  const accessKey = process.env.ECHO_BACKUP_S3_ACCESS_KEY;
  const secretKey = process.env.ECHO_BACKUP_S3_SECRET_KEY;

  const s3Uri = `s3://${bucket}/${remoteKey}`;

  log('info', 'Downloading from S3', { remote: s3Uri, local: localPath });

  const env = {
    ...process.env,
    AWS_ACCESS_KEY_ID: accessKey,
    AWS_SECRET_ACCESS_KEY: secretKey,
    AWS_DEFAULT_REGION: 'auto',
  };

  try {
    await execPromise(
      'aws',
      ['s3', 'cp', s3Uri, localPath, '--endpoint-url', endpoint],
      env,
    );

    log('info', 'Download completed', { key: remoteKey });
  } catch (err) {
    log('error', 'Download failed', { key: remoteKey, error: err.message });
    throw err;
  }
}

async function runPgRestore(dumpPath, targetDbUrl) {
  log('info', 'Starting pg_restore', {
    source: dumpPath,
    target: targetDbUrl.replace(/:[^:@]+@/, ':***@'),
  });

  // Show warning and wait for confirmation
  console.error(
    '\n┌─────────────────────────────────────────────────────────────────┐',
  );
  console.error(
    '│  WARNING: pg_restore is destructive on the target database!     │',
  );
  console.error(
    '│                                                                 │',
  );
  console.error(
    '│  This will DROP and recreate objects in the target database.    │',
  );
  console.error(
    '│  Recommended: Restore to a scratch database first for smoke test. │',
  );
  console.error(
    '└─────────────────────────────────────────────────────────────────┘\n',
  );

  // Check for common CLI flags that might indicate non-interactive mode
  const nonInteractive =
    process.env.CI === 'true' || process.env.FORCE_RESTORE === 'true';

  if (!nonInteractive) {
    console.error(
      'Add FORCE_RESTORE=true to skip this confirmation (e.g., in scripts).',
    );
    console.error('Press Ctrl+C to abort, or wait 5 seconds to continue...\n');
    await new Promise((r) => setTimeout(r, 5000));
  }

  try {
    // pg_restore with --clean to drop objects before recreating
    // --if-exists prevents errors if objects don't exist
    await execPromise(
      'pg_restore',
      ['--clean', '--if-exists', '-v', '-d', targetDbUrl, dumpPath],
      process.env,
    );

    log('info', 'pg_restore completed successfully');
  } catch (err) {
    log('error', 'pg_restore failed', { error: err.message });
    throw err;
  }
}

const parsedArgs = parseArgs();

async function main() {
  if (parsedArgs.help) {
    printHelp();
    process.exit(0);
  }

  log('info', 'Echo backup restore starting');

  // Security: require root
  checkSudo();

  // Validate args
  if (!parsedArgs.date || !/^\d{4}-\d{2}-\d{2}$/.test(parsedArgs.date)) {
    log('error', 'Invalid or missing --date (expected YYYY-MM-DD)');
    printHelp();
    process.exit(1);
  }

  const tier = parsedArgs.tier || 'daily';
  if (!['daily', 'weekly'].includes(tier)) {
    log('error', 'Invalid --tier (expected "daily" or "weekly")');
    process.exit(1);
  }

  // Check environment
  checkEnv();

  const prefix = (process.env.ECHO_BACKUP_S3_PREFIX || 'postgres').replace(
    /^\/+|\/+$/g,
    '',
  );
  const tmpBase = process.env.ECHO_BACKUP_TMP_DIR || tmpdir();
  const targetDbUrl = parsedArgs.targetDbUrl || process.env.DATABASE_URL;

  const remoteKey = `${prefix}/${tier}/${parsedArgs.date}.dump`;

  let tempDir = null;
  let dumpPath = null;

  try {
    // Create secure temp directory
    tempDir = await mkdtemp(join(tmpBase, 'echo-restore-'));
    await chmod(tempDir, 0o700);

    dumpPath = join(tempDir, 'echo-restore.dump');

    // Download backup
    await downloadFromS3(remoteKey, dumpPath);

    // Run restore
    await runPgRestore(dumpPath, targetDbUrl);

    log('info', 'Restore completed successfully', {
      date: parsedArgs.date,
      tier,
      target: targetDbUrl.replace(/:[^:@]+@/, ':***@'),
    });
  } catch (err) {
    log('error', 'Restore failed', { error: err.message });
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
