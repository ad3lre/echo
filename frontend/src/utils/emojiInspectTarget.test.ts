// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  findEmojiInspectElement,
  parseEmojiInspectAnchor,
} from '@/utils/emojiInspectTarget';

describe('emojiInspectTarget', () => {
  it('parses unicode twemoji img', () => {
    document.body.innerHTML = `
      <div class="message-content">
        <img class="emoji" alt="😀" data-echo-unicode-emoji="😀" src="/twemoji/1f600.webp" />
      </div>
    `;
    const img = document.querySelector('img.emoji') as HTMLImageElement;
    expect(parseEmojiInspectAnchor(img)).toEqual({
      kind: 'unicode',
      emoji: '😀',
    });
  });

  it('parses custom emoji img', () => {
    document.body.innerHTML = `
      <div class="message-content">
        <img class="emoji custom-emoji" data-emoji-id="99" data-emoji-name="pepe" data-emoji-animated="true" alt=":pepe:" src="/e.png" />
      </div>
    `;
    const img = document.querySelector('img.custom-emoji') as HTMLImageElement;
    expect(parseEmojiInspectAnchor(img)).toEqual({
      kind: 'custom',
      id: '99',
      name: 'pepe',
      animated: true,
    });
  });

  it('ignores reaction pills', () => {
    document.body.innerHTML = `
      <button class="reaction-pill">
        <img class="emoji" alt="😀" data-echo-unicode-emoji="😀" src="/twemoji/1f600.webp" />
      </button>
    `;
    const img = document.querySelector('img.emoji') as HTMLImageElement;
    expect(findEmojiInspectElement(img)).toBeNull();
  });
});
