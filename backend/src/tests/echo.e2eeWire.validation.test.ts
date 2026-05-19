import assert from 'node:assert/strict';
import { validateMessagePayload } from '../sockets/messageValidation';

async function run(): Promise<void> {
  const base = {
    channelId: 'ch1',
    content: '',
    messageFormatVersion: 3,
    contentSchemaVersion: 1,
    encryption: {
      kind: 'e2ee',
      version: 1,
      senderDeviceId: 'dev1',
      envelope: { protocol: 'libsignal-v1', signalMsgType: 3 },
      ciphertext: JSON.stringify({ type: 3, body: 'e30=', registrationId: 1 }),
    },
    imageUrl: 'https://example.com/a.png',
  };

  const bad = validateMessagePayload(base);
  assert.equal(bad.ok, false);
  assert.ok(
    typeof bad === 'object' &&
      bad &&
      'error' in bad &&
      String((bad as { error: string }).error).includes('media'),
  );

  const v2parts = {
    kind: 'echo-e2ee-v2',
    parts: [
      {
        targetProtocolDeviceId: 1,
        type: 3,
        body: 'e30=',
        registrationId: 1,
      },
    ],
  };
  const v2 = validateMessagePayload({
    channelId: 'ch1',
    content: '',
    messageFormatVersion: 3,
    contentSchemaVersion: 1,
    encryption: {
      kind: 'e2ee',
      version: 2,
      senderDeviceId: 'dev1',
      envelope: { protocol: 'libsignal-v1-multi', senderProtocolDeviceId: 1 },
      ciphertext: JSON.stringify(v2parts),
    },
  });
  assert.equal(v2.ok, true);
  if (v2.ok) {
    assert.equal(v2.value.e2eeEncryptionVersion, 2);
  }

  const v2bad = validateMessagePayload({
    channelId: 'ch1',
    content: '',
    messageFormatVersion: 3,
    contentSchemaVersion: 1,
    encryption: {
      kind: 'e2ee',
      version: 2,
      senderDeviceId: 'dev1',
      envelope: { protocol: 'libsignal-v1-multi' },
      ciphertext: JSON.stringify({ kind: 'echo-e2ee-v2', parts: [] }),
    },
  });
  assert.equal(v2bad.ok, false);

  console.log('echo.e2eeWire.validation: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
