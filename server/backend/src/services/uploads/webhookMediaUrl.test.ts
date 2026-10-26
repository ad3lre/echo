import { describe, expect, test } from 'bun:test';
import type { Embed } from '../../../../../contracts/types';
import { sanitizeWebhookEmbeds } from './webhookMediaUrl';

describe('sanitizeWebhookEmbeds URL schemes', () => {
  test('drops unsafe-scheme link and icon URLs', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      'vbscript:msgbox(1)',
    ]) {
      const out = sanitizeWebhookEmbeds([
        {
          title: 't',
          url: bad,
          author: { name: 'a', url: bad, icon_url: bad },
          footer: { text: 'f', icon_url: bad },
          image: { url: bad },
          thumbnail: { url: bad },
          video: { kind: 'youtube', embedUrl: bad },
        },
      ] as Embed[]);
      const e = out![0] as Record<string, any>;
      expect(e.url).toBeUndefined();
      expect(e.author.url).toBeUndefined();
      expect(e.author.icon_url).toBeUndefined();
      expect(e.footer.icon_url).toBeUndefined();
      expect(e.image).toBeUndefined();
      expect(e.thumbnail).toBeUndefined();
      expect(e.video).toBeUndefined();
      expect(e.title).toBe('t');
    }
  });

  test('keeps https link URLs', () => {
    const out = sanitizeWebhookEmbeds([
      {
        url: 'https://example.com/a',
        author: { name: 'a', url: 'https://example.com/u' },
        video: { kind: 'youtube', embedUrl: 'https://www.youtube.com/embed/x' },
      },
    ] as Embed[]);
    const e = out![0] as Record<string, any>;
    expect(e.url).toBe('https://example.com/a');
    expect(e.author.url).toBe('https://example.com/u');
    expect(e.video.embedUrl).toBe('https://www.youtube.com/embed/x');
  });
});
