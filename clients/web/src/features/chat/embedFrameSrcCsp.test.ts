import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  vimeoIframeEmbedUrl,
  youtubeIframeEmbedUrl,
} from '@shared/videoEmbedIds';
import * as vcTypes from '../voice/vcActivityTypes';

function cspDirective(name: string): string[] {
  const headers = readFileSync(
    fileURLToPath(new URL('../../../deploy/_headers', import.meta.url)),
    'utf8',
  );
  const line = headers
    .split('\n')
    .find((l) => l.trim().startsWith('Content-Security-Policy:'));
  expect(line).toBeTruthy();
  const part = line!
    .replace(/^\s*Content-Security-Policy:\s*/, '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name} `));
  expect(part).toBeTruthy();
  return part!.split(/\s+/).slice(1);
}

describe('iframe embed hosts vs CSP', () => {
  it('every embed iframe origin is allowed by frame-src', () => {
    const frameSrc = cspDirective('frame-src');
    const urls = [
      ...Object.entries(vcTypes)
        .filter(([k, v]) => /_EMBED_URL$/.test(k) && typeof v === 'string')
        .map(([, v]) => v as string),
      youtubeIframeEmbedUrl('dQw4w9WgXcQ'),
      vimeoIframeEmbedUrl('123456789'),
    ];
    expect(urls.length).toBeGreaterThan(5);
    for (const u of urls) {
      expect(frameSrc, u).toContain(new URL(u).origin);
    }
  });

  it('connect-src does not allow blanket wss:', () => {
    expect(cspDirective('connect-src')).not.toContain('wss:');
  });
});
