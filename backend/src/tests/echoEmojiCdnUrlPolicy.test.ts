import assert from 'node:assert/strict';
import { ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX } from '../../../shared/echoEmojiCdn';
import { encodeS3CopySource } from '../services/echoEmojiCdnPublish';
import {
  isAllowedPublicEmojiCdnUrl,
  sanitizePublicCdnUrlForClient,
} from '../services/echoEmojiCdnUrlPolicy';

function run(): void {
  const emojiId = '304238867010606080';
  const publicPath = `${ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX}${emojiId}`;
  assert.equal(isAllowedPublicEmojiCdnUrl(publicPath), true);
  assert.equal(sanitizePublicCdnUrlForClient(publicPath), publicPath);

  assert.equal(
    isAllowedPublicEmojiCdnUrl(
      'https://evil.example/echo/public-emojis/x.webp',
    ),
    false,
  );
  assert.equal(sanitizePublicCdnUrlForClient('javascript:alert(1)'), null);
  assert.equal(
    sanitizePublicCdnUrlForClient('https://cdn.test/echo/public-emojis/x.webp'),
    null,
  );

  assert.equal(
    encodeS3CopySource('my-bucket', 'echo/emoji/srv/u1/wave.webp'),
    'my-bucket/echo/emoji/srv/u1/wave.webp',
  );
  assert.equal(encodeS3CopySource('b', 'a b/c'), 'b/a%20b/c');
  assert.equal(
    encodeS3CopySource('b', 'emoji/weird+name.png'),
    'b/emoji/weird%2Bname.png',
  );

  console.log('echoEmojiCdnUrlPolicy: ok');
}

run();
