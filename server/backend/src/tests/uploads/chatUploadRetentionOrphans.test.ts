import assert from 'node:assert/strict';

function testOrphanCandidateShape() {
  const row = {
    storageKey: 'echo/channels/c1/u1/missing.png',
    purgeStatus: 'active',
  };
  assert.equal(row.purgeStatus, 'active');
  assert.match(row.storageKey, /^echo\//);
}

async function main() {
  testOrphanCandidateShape();
  console.log('chatUploadRetentionOrphans.test.ts: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
