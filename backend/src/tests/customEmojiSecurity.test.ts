import assert from 'node:assert/strict';
import { isSafeCustomEmojiImageUrl } from '../domain/echoStore/emojiLibrary';

async function run(): Promise<void> {
  assert.equal(
    isSafeCustomEmojiImageUrl('https://cdn.example.com/emoji/test.webp'),
    true,
  );
  assert.equal(isSafeCustomEmojiImageUrl('/uploads/emoji/test.webp'), true);
  assert.equal(
    isSafeCustomEmojiImageUrl('data:image/svg+xml,<svg onload=alert(1)>'),
    false,
  );
  assert.equal(isSafeCustomEmojiImageUrl('javascript:alert(1)'), false);
  assert.equal(isSafeCustomEmojiImageUrl('vbscript:alert(1)'), false);
}

run()
  .then(() => console.log('customEmojiSecurity tests passed'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
