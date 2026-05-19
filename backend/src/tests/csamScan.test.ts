/**
 * Unit tests for CSAM scan helpers (synthetic fixtures only).
 * Run: npm run test:csam -w backend
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runExternalCsamScanCmd } from '../services/csamScan/externalScanCmd';
import { Sha256BlocklistStore } from '../services/csamScan/sha256Blocklist';
import {
  CSAM_HASH_LIST_UPDATE_GUIDANCE,
  CSAM_OPERATOR_LEGAL_PREREQUISITES,
} from '../services/csamScan/legalPrerequisites';

async function testBlocklist(): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'echo-csam-bl-'));
  const listPath = path.join(dir, 'list.txt');
  const bytes = Buffer.from([9, 8, 7, 6]);
  const h = createHash('sha256').update(bytes).digest('hex');
  await writeFile(listPath, `# comment\n${h}\n`, 'utf8');

  const store = new Sha256BlocklistStore(listPath, 0);
  await store.refreshIfNeeded();
  assert.equal(store.has(h), true);
  assert.equal(store.has('0'.repeat(64)), false);
}

async function testExternalCmd(): Promise<void> {
  const pass = await runExternalCsamScanCmd({
    argvTemplate: ['node', '-e', 'process.exit(0)'],
    inputBytes: Buffer.from('x'),
    timeoutMs: 5000,
  });
  assert.equal(pass, 'pass');

  const match = await runExternalCsamScanCmd({
    argvTemplate: ['node', '-e', 'process.exit(2)'],
    inputBytes: Buffer.from('x'),
    timeoutMs: 5000,
  });
  assert.equal(match, 'match');

  const err = await runExternalCsamScanCmd({
    argvTemplate: ['node', '-e', 'process.exit(7)'],
    inputBytes: Buffer.from('x'),
    timeoutMs: 5000,
  });
  assert.equal(err, 'error');

  const inputPathOk = await runExternalCsamScanCmd({
    argvTemplate: ['sh', '-c', 'test -s INPUT_PATH && exit 0'],
    inputBytes: Buffer.from('hello'),
    timeoutMs: 5000,
  });
  assert.equal(inputPathOk, 'pass');
}

async function testLegalPrereq(): Promise<void> {
  assert.ok(CSAM_OPERATOR_LEGAL_PREREQUISITES.includes('NCMEC'));
  assert.ok(CSAM_HASH_LIST_UPDATE_GUIDANCE.includes('atomic'));
}

async function run(): Promise<void> {
  await testBlocklist();
  await testExternalCmd();
  await testLegalPrereq();
  console.log('csamScan.test: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
