import assert from 'node:assert/strict';
import { buildEchoUploadPublicUrlForStorageKey } from '../services/s3UploadPresign';
import { extractEchoStorageKeyFromPublicUrl } from '../services/echoUploadPublicUrl';
import { mediaUrlPassesEchoPolicy } from '../services/mediaUrlPolicy';
import { validateMessagePayload } from '../sockets/messageValidation';

function testEchoHostedGifAttachmentAccepted() {
  const key = 'echo/channels/ch1/u1/remote-image-123.gif';
  const url = buildEchoUploadPublicUrlForStorageKey(key);
  assert.ok(url, 'expected public URL for storage key');
  assert.equal(extractEchoStorageKeyFromPublicUrl(url), key);
  assert.equal(mediaUrlPassesEchoPolicy(url), true);

  const validated = validateMessagePayload({
    channelId: 'ch1',
    content: '',
    attachments: [
      {
        url,
        kind: 'gif',
        mimeType: 'image/gif',
        storageKey: key,
      },
    ],
  });
  assert.equal(validated.ok, true, validated.ok ? '' : validated.error);
  if (!validated.ok) return;
  assert.equal(validated.value.attachments?.[0]?.kind, 'gif');
  assert.equal(validated.value.attachments?.[0]?.storageKey, key);
  assert.equal(validated.value.gif, true);
}

async function main() {
  testEchoHostedGifAttachmentAccepted();
  console.log('gifAttachmentValidation.test.ts: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
