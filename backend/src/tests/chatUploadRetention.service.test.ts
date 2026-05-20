import assert from 'node:assert/strict';
import {
  CHAT_MEDIA_RETENTION_BASE_MS,
  CHAT_MEDIA_RETENTION_PLUS_DECAY_MULTIPLIER,
  computeAbandonMs,
} from '../../../shared/chatMediaRetention';

function testRevokedPermanentMultipliers(): void {
  const base = CHAT_MEDIA_RETENTION_BASE_MS.upTo10Mb;
  assert.equal(
    computeAbandonMs(1024, 'plus', { revokedPermanent: true }),
    Math.floor(base * CHAT_MEDIA_RETENTION_PLUS_DECAY_MULTIPLIER),
  );
}

testRevokedPermanentMultipliers();
console.log('chatUploadRetention.service.test.ts: ok');
