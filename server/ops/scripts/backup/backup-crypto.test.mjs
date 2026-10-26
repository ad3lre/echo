import { describe, expect, it } from 'bun:test';
import { randomBytes } from 'crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  decryptFile,
  encryptFile,
  parseBackupKey,
  resolveBackupMode,
} from './backup-crypto.mjs';

describe('backup-crypto', () => {
  it('round-trips and detects tampering / wrong key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-bk-test-'));
    try {
      const key = randomBytes(32);
      const plain = join(dir, 'a.dump');
      const enc = join(dir, 'a.dump.enc');
      const out = join(dir, 'a.out');
      const data = randomBytes(200_000);
      writeFileSync(plain, data);
      await encryptFile(plain, enc, key);
      await decryptFile(enc, out, key);
      expect(readFileSync(out).equals(data)).toBe(true);

      await expect(
        decryptFile(enc, join(dir, 'b.out'), randomBytes(32)),
      ).rejects.toThrow();

      const bad = readFileSync(enc);
      bad[bad.length - 40] ^= 1;
      writeFileSync(join(dir, 'bad.enc'), bad);
      await expect(
        decryptFile(join(dir, 'bad.enc'), join(dir, 'c.out'), key),
      ).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses hex and base64 keys', () => {
    const k = randomBytes(32);
    expect(parseBackupKey(k.toString('hex')).equals(k)).toBe(true);
    expect(parseBackupKey(k.toString('base64')).equals(k)).toBe(true);
    expect(parseBackupKey('')).toBeNull();
    expect(() => parseBackupKey('short')).toThrow();
  });

  it('enforces key in production unless plaintext allowed', () => {
    expect(() => resolveBackupMode({ NODE_ENV: 'production' })).toThrow();
    expect(
      resolveBackupMode({
        NODE_ENV: 'production',
        ECHO_BACKUP_ALLOW_PLAINTEXT: '1',
      }),
    ).toBe('plaintext');
    expect(resolveBackupMode({})).toBe('plaintext');
    expect(
      resolveBackupMode({
        NODE_ENV: 'production',
        ECHO_BACKUP_ENCRYPTION_KEY: 'ab'.repeat(32),
      }),
    ).toBe('encrypt');
  });
});
