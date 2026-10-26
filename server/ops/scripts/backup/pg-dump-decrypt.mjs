#!/usr/bin/env bun
/**
 * Decrypt an Echo encrypted pg_dump backup (`*.dump.enc`) produced by pg-dump-upload.mjs.
 *
 * Usage:
 *   ECHO_BACKUP_ENCRYPTION_KEY=<64 hex | base64 32 bytes> \
 *     bun server/ops/scripts/backup/pg-dump-decrypt.mjs <in.dump.enc> <out.dump>
 * Then restore with pg_restore / pg-restore.mjs. Authentication failure (wrong key or tampering)
 * exits non-zero and the partial output is deleted.
 */
import { unlink } from 'fs/promises';
import { decryptFile, parseBackupKey } from './backup-crypto.mjs';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: pg-dump-decrypt.mjs <in.dump.enc> <out.dump>');
  process.exit(2);
}
try {
  const key = parseBackupKey(process.env.ECHO_BACKUP_ENCRYPTION_KEY);
  if (!key) throw new Error('ECHO_BACKUP_ENCRYPTION_KEY is not set');
  await decryptFile(inPath, outPath, key);
  console.log(`decrypted -> ${outPath}`);
} catch (err) {
  await unlink(outPath).catch(() => {});
  console.error(`decrypt failed: ${err.message}`);
  process.exit(1);
}
