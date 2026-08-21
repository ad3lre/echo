import assert from 'node:assert/strict';
import { buildEchoUploadPublicUrlForStorageKey } from '../../services/uploads/s3UploadPresign';
import { extractEchoStorageKeyFromPublicUrl } from '../../services/uploads/echoUploadPublicUrl';
import { mediaUrlPassesEchoPolicy } from '../../services/uploads/mediaUrlPolicy';
import { validateMessagePayload } from '../../sockets/messageValidation';

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

function testTenorGifPassthroughAttachmentAccepted() {
  const url = 'https://media.tenor.com/abc123/tenor.gif';
  assert.equal(mediaUrlPassesEchoPolicy(url), true);

  const validated = validateMessagePayload({
    channelId: 'ch1',
    content: '',
    attachments: [
      {
        url,
        kind: 'gif',
        mimeType: 'image/gif',
      },
    ],
  });
  assert.equal(validated.ok, true, validated.ok ? '' : validated.error);
  if (!validated.ok) return;
  assert.equal(validated.value.attachments?.[0]?.url, url);
  assert.equal(validated.value.attachments?.[0]?.kind, 'gif');
  assert.equal(validated.value.gif, true);
}

async function main() {
  testEchoHostedGifAttachmentAccepted();
  testTenorGifPassthroughAttachmentAccepted();
  console.log('gifAttachmentValidation.test.ts: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
