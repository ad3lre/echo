import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalDiscordHostedImportMediaUrl,
  isDiscordHostedImportMediaUrl,
  pickDiscordUrlOrProxy,
} from '../../domain/discord/discordCdnUrls';

describe('discordCdnUrls SSRF guards', () => {
  it('accepts Discord CDN hosts only', () => {
    assert.equal(
      canonicalDiscordHostedImportMediaUrl(
        'https://cdn.discordapp.com/attachments/1/2/file.png?ex=1',
      ),
      'https://cdn.discordapp.com/attachments/1/2/file.png?ex=1',
    );
    assert.equal(
      isDiscordHostedImportMediaUrl(
        'https://media.discordapp.net/attachments/1/2/file.png',
      ),
      true,
    );
    assert.equal(
      isDiscordHostedImportMediaUrl(
        'https://images-ext-1.discordapp.net/external/abc/https/example.com/x.jpg',
      ),
      true,
    );
  });

  it('normalizes malformed trailing ampersand query strings', () => {
    assert.equal(
      canonicalDiscordHostedImportMediaUrl(
        'https://cdn.discordapp.com/attachments/1/2/file.png?ex=1&hm=2&',
      ),
      'https://cdn.discordapp.com/attachments/1/2/file.png?ex=1&hm=2',
    );
  });

  it('prefers Discord CDN proxy over third-party url', () => {
    assert.equal(
      pickDiscordUrlOrProxy({
        url: 'https://example.com/image.png',
        proxy_url:
          'https://images-ext-1.discordapp.net/external/x/https/example.com/image.png',
      }),
      'https://images-ext-1.discordapp.net/external/x/https/example.com/image.png',
    );
  });

  it('rejects non-Discord and internal targets', () => {
    assert.equal(
      canonicalDiscordHostedImportMediaUrl('https://evil.example/a.png'),
      null,
    );
    assert.equal(
      canonicalDiscordHostedImportMediaUrl('http://127.0.0.1/a.png'),
      null,
    );
    assert.equal(
      canonicalDiscordHostedImportMediaUrl(
        'https://cdn.discordapp.com:443@127.0.0.1/a.png',
      ),
      null,
    );
  });
});
