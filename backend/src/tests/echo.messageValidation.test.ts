import assert from 'node:assert/strict';
import {
  validateMessageEditPayload,
  validateMessagePayload,
} from '../sockets/messageValidation';

async function run(): Promise<void> {
  assert.equal(
    validateMessageEditPayload(
      {
        channelId: 'ch1',
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        contentText: 'x',
      },
      { existingMessageFormatVersion: 1 },
    ).ok,
    false,
    'rejects contentText',
  );

  const legacy = validateMessageEditPayload(
    {
      channelId: 'ch1',
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'hi',
    },
    { existingMessageFormatVersion: 1 },
  );
  assert.equal(legacy.ok, true);
  if (legacy.ok) assert.equal(legacy.value.editKind, 'legacy');

  assert.equal(
    validateMessageEditPayload(
      {
        channelId: 'ch1',
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'hi',
      },
      { existingMessageFormatVersion: 2 },
    ).ok,
    false,
    'v2 row rejects legacy-only content',
  );

  const json = validateMessageEditPayload(
    {
      channelId: 'ch1',
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      contentJson: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'ok' }] },
        ],
      },
    },
    { existingMessageFormatVersion: 2 },
  );
  assert.equal(json.ok, true);
  if (json.ok) {
    assert.equal(json.value.editKind, 'json');
    assert.ok(json.value.content.includes('ok'));
  }

  const dataImageOk = validateMessagePayload({
    channelId: 'ch1',
    content: 'img',
    imageUrl: 'data:image/png;base64,AAAA',
  });
  assert.equal(dataImageOk.ok, true, 'small image data URL is accepted');

  const dataHtmlReject = validateMessagePayload({
    channelId: 'ch1',
    content: 'bad',
    imageUrl: 'data:text/html;base64,PGgxPkJvb208L2gxPg==',
  });
  assert.equal(dataHtmlReject.ok, false, 'non-image data URL is rejected');

  const dataHugeReject = validateMessagePayload({
    channelId: 'ch1',
    content: 'huge',
    imageUrl: `data:image/png;base64,${'A'.repeat(14 * 1024 * 1024)}`,
  });
  assert.equal(dataHugeReject.ok, false, 'oversized data URL is rejected');

  console.log('echo.messageValidation: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
