import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyExactBump,
  collectVersionRiskPaths,
  formatReleaseCommitMessage,
  LEVEL_TO_ATTEST,
  parseReleaseCommitMessage,
  validateBumpAttestation,
  validateReleaseCommitForBump,
} from './echo-version.mjs';

test('classifyExactBump accepts one-step patch/minor/major only', () => {
  assert.equal(classifyExactBump('0.0.11', '0.0.12').level, 'patch');
  assert.equal(classifyExactBump('0.0.11', '0.1.0').level, 'minor');
  assert.equal(classifyExactBump('0.0.11', '1.0.0').level, 'major');
  assert.equal(classifyExactBump('0.0.11', '0.0.11').ok, false);
  assert.equal(classifyExactBump('0.0.11', '0.0.13').ok, false);
});

test('patch requires compatible attest and rejects lazy why', () => {
  const bad = validateBumpAttestation({
    level: 'patch',
    attest: 'compatible',
    summary: 'bump version',
    why: 'patch is fine',
  });
  assert.equal(bad.ok, false);

  const mismatch = validateBumpAttestation({
    level: 'patch',
    attest: 'breaking',
    summary: 'Lock password accounts until email verify completes',
    why: 'Self-host upgrade breaks: login now requires email OTP for new IPs with no opt-out.',
  });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.reason, /requires --attest compatible/);

  const ok = validateBumpAttestation({
    level: 'patch',
    attest: 'compatible',
    summary: 'Fix pipeline hang in websocket and outbox dual-target paths',
    why: 'Self-host compatible: CI/test hang fix only; no API, auth, or schema behavior change for operators.',
  });
  assert.equal(ok.ok, true);
});

test('risk paths block compatible without --risk-ok', () => {
  const risk = collectVersionRiskPaths([
    'server/backend/src/auth/middleware.ts',
    'clients/web/src/features/chat/Foo.vue',
  ]);
  assert.deepEqual(risk, ['server/backend/src/auth/middleware.ts']);

  const blocked = validateBumpAttestation({
    level: 'patch',
    attest: 'compatible',
    summary: 'Harden auth middleware allowlist for verify routes',
    why: 'Self-host compatible: allowlist-only change; login and upgrade behavior unchanged for operators.',
    riskPaths: risk,
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /risk paths/);

  const allowed = validateBumpAttestation({
    level: 'patch',
    attest: 'compatible',
    summary: 'Harden auth middleware allowlist for verify routes',
    why: 'Self-host compatible: allowlist-only change; login and upgrade behavior unchanged for operators.',
    riskPaths: risk,
    riskOk:
      'Still compatible: only adds allowlisted verify routes; operators can in-place upgrade with no auth break.',
  });
  assert.equal(allowed.ok, true);
});

test('breaking auth-lock style change must use minor + breaking', () => {
  const ok = validateBumpAttestation({
    level: 'minor',
    attest: 'breaking',
    summary: 'Lock password accounts until email verify, require new-IP OTP',
    why: 'Self-host breaking: upgrades force email verify lock and new-IP login OTP with no production opt-out.',
  });
  assert.equal(ok.ok, true);
  assert.equal(LEVEL_TO_ATTEST.minor, 'breaking');
});

test('release commit message round-trips and rejects chore(version)', () => {
  const msg = formatReleaseCommitMessage({
    version: '0.0.12',
    summary: 'Fix pipeline hang in websocket and outbox dual-target paths',
    attest: 'compatible',
    why: 'Self-host compatible: CI/test hang fix only; no API, auth, or schema behavior change for operators.',
    includedSubjects: [
      'Fix pipeline hang: websocket sockets, outbox dual-target',
    ],
  });
  assert.match(msg, /^release: 0\.0\.12 — /);
  assert.match(msg, /Echo-Version-Attest: compatible/);
  assert.match(msg, /Included changes:/);

  const parsed = parseReleaseCommitMessage(msg);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.version, '0.0.12');
    assert.equal(parsed.attest, 'compatible');
  }

  const chore = parseReleaseCommitMessage('chore(version): 0.0.12\n');
  assert.equal(chore.ok, false);

  const gate = validateReleaseCommitForBump({
    version: '0.0.12',
    level: 'patch',
    message: msg,
    riskPaths: [],
  });
  assert.equal(gate.ok, true);
});
