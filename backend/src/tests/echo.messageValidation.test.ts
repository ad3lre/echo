import assert from 'node:assert/strict';
import {
  validateImageSlotFillPayload,
  validateMessageEditPayload,
  validateMessagePayload,
} from '../sockets/messageValidation';
import { validateContentJsonForWrite } from '../domain/contentJsonValidation';
import { isEchoS3UploadConfigured } from '../services/s3UploadPresign';
import { config } from '../config';
import { DISCORD_BUTTON_STYLE } from '../../../shared/discordMessageComponents';

const emptyImageSlotDoc = {
  type: 'doc',
  content: [
    {
      type: 'imageSlot',
      attrs: {
        slotId: 'slot-1',
        aspectW: 16,
        aspectH: 9,
        imageUrl: null,
        storageKey: null,
        width: null,
        height: null,
      },
    },
  ],
};

const emptyButtonRowDoc = {
  type: 'doc',
  content: [
    {
      type: 'buttonRow',
      attrs: {
        rowId: 'row-1',
        buttons: [
          {
            label: 'Go',
            style: DISCORD_BUTTON_STYLE.LINK,
            url: 'https://example.com',
          },
        ],
      },
    },
  ],
};

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
  if (isEchoS3UploadConfigured()) {
    assert.equal(
      dataImageOk.ok,
      false,
      'data URL image rejected when uploads are configured',
    );
  } else {
    assert.equal(dataImageOk.ok, true, 'small image data URL is accepted');
  }

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

  const giphyAttach = validateMessagePayload({
    channelId: 'ch1',
    content: '',
    attachments: [
      {
        url: 'https://media.giphy.com/media/abc123/giphy.gif',
        kind: 'gif',
      },
    ],
  });
  assert.equal(giphyAttach.ok, true, 'GIF CDN attachment URL is accepted');

  const echoStorageAttach = validateMessagePayload({
    channelId: 'ch1',
    content: '',
    attachments: [
      {
        url: '/api/v1/echo/uploads/files/echo/channels/ch1/u1/x.png',
        kind: 'image',
      },
    ],
  });
  if (config.echoLocalUploadDir) {
    assert.equal(
      echoStorageAttach.ok,
      true,
      'local Echo upload attachment URL is accepted',
    );
  } else {
    assert.equal(
      echoStorageAttach.ok,
      false,
      'local Echo upload attachment URL rejected without local upload dir',
    );
  }

  const emptySlotSend = validateMessagePayload({
    channelId: 'ch1',
    content: '',
    contentJson: emptyImageSlotDoc,
    contentSchemaVersion: 2,
  });
  assert.equal(
    emptySlotSend.ok,
    true,
    'empty plain with image slot is accepted',
  );

  const forwardSlotReject = validateMessagePayload({
    channelId: 'ch1',
    content: '',
    contentJson: emptyImageSlotDoc,
    contentSchemaVersion: 2,
    forwardMessageId: '550e8400-e29b-41d4-a716-446655440000',
  });
  assert.equal(
    forwardSlotReject.ok,
    false,
    'forward with image slots is rejected',
  );

  const emptySlotEdit = validateMessageEditPayload(
    {
      channelId: 'ch1',
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      contentJson: emptyImageSlotDoc,
      contentSchemaVersion: 2,
    },
    { existingMessageFormatVersion: 2 },
  );
  assert.equal(emptySlotEdit.ok, true, 'edit to slot-only body is accepted');

  const emptyButtonSend = validateMessagePayload({
    channelId: 'ch1',
    content: '',
    contentJson: emptyButtonRowDoc,
    contentSchemaVersion: 2,
  });
  assert.equal(
    emptyButtonSend.ok,
    true,
    'empty plain with button row is accepted',
  );

  const forwardButtonReject = validateMessagePayload({
    channelId: 'ch1',
    content: '',
    contentJson: emptyButtonRowDoc,
    contentSchemaVersion: 2,
    forwardMessageId: '550e8400-e29b-41d4-a716-446655440000',
  });
  assert.equal(
    forwardButtonReject.ok,
    false,
    'forward with button rows is rejected',
  );

  const emptyButtonEdit = validateMessageEditPayload(
    {
      channelId: 'ch1',
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      contentJson: emptyButtonRowDoc,
      contentSchemaVersion: 2,
    },
    { existingMessageFormatVersion: 2 },
  );
  assert.equal(
    emptyButtonEdit.ok,
    true,
    'edit to button-row-only body is accepted',
  );

  const tooManyRowsDoc = {
    type: 'doc',
    content: Array.from({ length: 6 }, (_, i) => ({
      type: 'buttonRow',
      attrs: {
        rowId: `row-${i}`,
        buttons: [
          {
            label: `B${i}`,
            style: DISCORD_BUTTON_STYLE.SECONDARY,
            customId: `id-${i}`,
          },
        ],
      },
    })),
  };
  const tooManyRows = validateContentJsonForWrite(tooManyRowsDoc);
  assert.equal(tooManyRows.ok, false, 'more than 5 button rows rejected');
  if (!tooManyRows.ok) {
    assert.match(tooManyRows.error, /max buttonRow blocks/);
  }

  const fillOk = validateImageSlotFillPayload({
    channelId: 'ch1',
    messageId: '550e8400-e29b-41d4-a716-446655440000',
    slotId: 'slot-1',
    imageUrl: 'https://media.giphy.com/media/abc123/giphy.gif',
  });
  assert.equal(fillOk.ok, true, 'fill payload with CDN image URL is accepted');
  if (fillOk.ok) {
    assert.equal(fillOk.value.slotId, 'slot-1');
  }

  console.log('echo.messageValidation: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
