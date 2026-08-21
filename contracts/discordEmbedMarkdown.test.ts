import { describe, expect, it } from 'vitest';
import {
  parseDiscordEmbedMarkdownToHtml,
  preprocessDiscordUnderlinesForMarkdown,
} from '@shared/discordEmbedMarkdown';

describe('parseDiscordEmbedMarkdownToHtml', () => {
  it('renders bold, italic, underline, and strike', () => {
    const html = parseDiscordEmbedMarkdownToHtml(
      '**bold** *italic* __underline__ ~~strike~~',
    );
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<u>underline</u>');
    expect(html).toContain('<s>strike</s>');
  });

  it('renders inline and fenced code', () => {
    const html = parseDiscordEmbedMarkdownToHtml(
      'run `npm test` then:\n```js\nconsole.log(1);\n```',
    );
    expect(html).toContain(
      '<code class="discord-embed-md-inline">npm test</code>',
    );
    expect(html).toContain('<pre class="discord-embed-md-pre">');
    expect(html).toContain('class="language-js"');
    expect(html).toContain('console.log(1);');
  });

  it('renders spoilers and escapes raw HTML', () => {
    const html = parseDiscordEmbedMarkdownToHtml('||secret|| <script>');
    expect(html).toContain('<span class="spoiler">secret</span>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('honors backslash escapes', () => {
    const html = parseDiscordEmbedMarkdownToHtml(String.raw`\*\*not bold\*\*`);
    expect(html).toContain('**not bold**');
    expect(html).not.toContain('<strong>');
  });

  it('preserves line breaks outside code blocks', () => {
    const html = parseDiscordEmbedMarkdownToHtml('line one\nline two');
    expect(html).toContain('line one<br>line two');
  });

  it('renders underline combinations', () => {
    expect(parseDiscordEmbedMarkdownToHtml('__**bold under**__')).toContain(
      '<u><strong>bold under</strong></u>',
    );
  });

  it('preprocesses Discord underlines for Echo markdown without HTML escaping', () => {
    expect(preprocessDiscordUnderlinesForMarkdown('__underline__')).toBe(
      '<u>underline</u>',
    );
    expect(preprocessDiscordUnderlinesForMarkdown('`__code__`')).toBe(
      '`__code__`',
    );
    expect(preprocessDiscordUnderlinesForMarkdown('a < b __u__')).toBe(
      'a < b <u>u</u>',
    );
  });
});
