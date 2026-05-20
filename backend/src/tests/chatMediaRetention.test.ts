import assert from 'node:assert/strict';
import {
  CHAT_MEDIA_RETENTION_BASE_MS,
  CHAT_MEDIA_RETENTION_BLACK_DECAY_MULTIPLIER,
  CHAT_MEDIA_RETENTION_PLUS_DECAY_MULTIPLIER,
  CHAT_MEDIA_RETENTION_PLUS_PERMANENT_BYTES,
  CHAT_MEDIA_RETENTION_BLACK_PERMANENT_BYTES,
  CHAT_MEDIA_RETENTION_TIER_10_MB,
  computeAbandonMs,
  isEchoChatUserMediaStorageKey,
  resolveChatUploadRetentionPolicy,
} from '../../../shared/chatMediaRetention';

function testBaseTiers(): void {
  assert.equal(
    computeAbandonMs(1024, 'free'),
    CHAT_MEDIA_RETENTION_BASE_MS.upTo10Mb,
  );
  assert.equal(
    computeAbandonMs(CHAT_MEDIA_RETENTION_TIER_10_MB, 'free'),
    CHAT_MEDIA_RETENTION_BASE_MS.upTo10Mb,
  );
  assert.equal(
    computeAbandonMs(CHAT_MEDIA_RETENTION_TIER_10_MB + 1, 'free'),
    CHAT_MEDIA_RETENTION_BASE_MS.upTo100Mb,
  );
  assert.equal(
    computeAbandonMs(101 * 1024 * 1024, 'free'),
    CHAT_MEDIA_RETENTION_BASE_MS.above100Mb,
  );
}

function testPlusMultiplier(): void {
  const over15 = CHAT_MEDIA_RETENTION_PLUS_PERMANENT_BYTES + 1;
  const ms = computeAbandonMs(over15, 'plus');
  assert.equal(
    ms,
    Math.floor(
      CHAT_MEDIA_RETENTION_BASE_MS.upTo100Mb *
        CHAT_MEDIA_RETENTION_PLUS_DECAY_MULTIPLIER,
    ),
  );
}

function testRevokedPermanent(): void {
  const base = CHAT_MEDIA_RETENTION_BASE_MS.upTo10Mb;
  assert.equal(
    computeAbandonMs(1024, 'plus', { revokedPermanent: true }),
    Math.floor(base * CHAT_MEDIA_RETENTION_PLUS_DECAY_MULTIPLIER),
  );
  assert.equal(
    computeAbandonMs(1024, 'black', { revokedPermanent: true }),
    Math.floor(base * CHAT_MEDIA_RETENTION_BLACK_DECAY_MULTIPLIER),
  );
  assert.equal(computeAbandonMs(1024, 'free', { revokedPermanent: true }), base);
}

function testPolicyPermanentAndPaused(): void {
  const plusSmall = resolveChatUploadRetentionPolicy(
    CHAT_MEDIA_RETENTION_PLUS_PERMANENT_BYTES,
    'plus',
    'user',
  );
  assert.equal(plusSmall.permanent, true);
  assert.equal(plusSmall.abandonMs, null);

  const blackLarge = resolveChatUploadRetentionPolicy(
    CHAT_MEDIA_RETENTION_BLACK_PERMANENT_BYTES + 1,
    'black',
    'user',
  );
  assert.equal(blackLarge.timerPaused, true);
  assert.equal(blackLarge.abandonMs, null);

  const webhook = resolveChatUploadRetentionPolicy(
    1024,
    'black',
    'webhook',
  );
  assert.equal(webhook.permanent, false);
  assert.ok(webhook.abandonMs != null);
}

function testStorageKeyClassifier(): void {
  assert.equal(
    isEchoChatUserMediaStorageKey('echo/channels/ch1/u1/file.png'),
    true,
  );
  assert.equal(
    isEchoChatUserMediaStorageKey('echo/srv1/u1/file.png'),
    true,
  );
  assert.equal(
    isEchoChatUserMediaStorageKey('echo/webhook-inbound/s/c/m/f.bin'),
    true,
  );
  assert.equal(
    isEchoChatUserMediaStorageKey('echo/avatars/u1/p.png'),
    false,
  );
  assert.equal(
    isEchoChatUserMediaStorageKey('echo/emoji/s/u/e.png'),
    false,
  );
}

testBaseTiers();
testPlusMultiplier();
testRevokedPermanent();
testPolicyPermanentAndPaused();
testStorageKeyClassifier();
console.log('chatMediaRetention.test.ts: ok');
