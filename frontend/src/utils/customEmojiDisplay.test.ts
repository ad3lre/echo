// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  appIconTokensToShortcodes,
  customEmojiTokensToShortcodes,
  parseCustomEmojiToken,
  plainTextWithDisplayShortcodes,
  renderSingleEmojiHtml,
} from './customEmojiDisplay';

describe('customEmojiDisplay', () => {
  it('parses static and animated custom emoji tokens', () => {
    expect(parseCustomEmojiToken('<:pepe:123>')).toEqual({
      id: '123',
      name: 'pepe',
      animated: false,
    });
    expect(parseCustomEmojiToken('<a:dance:456>')).toEqual({
      id: '456',
      name: 'dance',
      animated: true,
    });
    expect(parseCustomEmojiToken('👋')).toBeNull();
  });

  it('converts wire tokens to Discord-style shortcodes', () => {
    expect(
      plainTextWithDisplayShortcodes('hi <:adel:99> and <a:wave:100>'),
    ).toBe('hi :adel: and :wave:');
    expect(appIconTokensToShortcodes('see <icon:message.svg> here')).toBe(
      'see :message: here',
    );
  });

  it('leaves unknown shortcodes untouched', () => {
    expect(customEmojiTokensToShortcodes(':not_a_token:')).toBe(
      ':not_a_token:',
    );
  });

  it('renders custom emoji html when url is cached', () => {
    const html = renderSingleEmojiHtml('<:wave:42>', {
      cachedById: new Map([['42', 'https://cdn.test/wave.webp']]),
    });
    expect(html).toContain('class="emoji custom-emoji"');
    expect(html).toContain('https://cdn.test/wave.webp');
  });

  it('falls back to :name: when custom emoji cannot resolve', () => {
    const html = renderSingleEmojiHtml('<:gone:7>', {
      cachedById: new Map(),
      echoResolveMissed: () => true,
    });
    expect(html).toBe(':gone:');
  });
});
