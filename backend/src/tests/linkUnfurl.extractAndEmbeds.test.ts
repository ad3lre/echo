/**
 * Run: npx ts-node src/tests/linkUnfurl.extractAndEmbeds.test.ts
 */
process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
process.env.ECHO_BACKEND_STORAGE = 'memory';
delete process.env.DATABASE_URL;
delete process.env.USE_MOCK_DB;

import assert from 'node:assert/strict';
import { YOUTUBE_INTEGRATION_ENABLED } from '../../../shared/integrationKillSwitches';
import {
  buildLinkEmbedsFromPlainText,
  extractHttpUrlsFromPlainText,
} from '../services/linkUnfurl/linkUnfurl';
import {
  isPrivateOrLocalIpLiteral,
  isUrlSafeForOutboundFetch,
} from '../services/linkUnfurl/linkUnfurlFetch';

async function main() {
  let failed = false;
  const run = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      // eslint-disable-next-line no-console
      console.log(`ok ${name}`);
    } catch (e) {
      failed = true;
      // eslint-disable-next-line no-console
      console.error(`FAIL ${name}`, e);
    }
  };

  await run(
    'extractHttpUrlsFromPlainText finds markdown parenthesis link',
    () => {
      const s =
        '## [Click here](https://www.canva.com/design/DAGEXlD0X3I/oS7G4eLs8K7sNLz9--Jzdw/edit?utm_medium=link2) <<';
      const urls = extractHttpUrlsFromPlainText(s, 12);
      assert.equal(urls.length >= 1, true);
      assert(urls.some((u) => u.includes('canva.com/design/DAGEXlD0X3I')));
    },
  );

  await run(
    'Canva stub embed is suppressed when EMBED_LINKS is denied',
    async () => {
      const content =
        '## [latest](https://www.canva.com/design/DAGEXlD0X3I/edit?utm_content=x) <<';
      const embeds = await buildLinkEmbedsFromPlainText(content, {
        allow: false,
      });
      assert.equal(embeds.length, 0);
    },
  );

  await run(
    'Canva stub embed is shown when EMBED_LINKS is allowed (no HTTP)',
    async () => {
      const content =
        '## [latest](https://www.canva.com/design/DAGEXlD0X3I/edit?utm_content=x) <<';
      const embeds = await buildLinkEmbedsFromPlainText(content, {
        allow: true,
      });
      assert.equal(embeds.length, 1);
      assert.equal(embeds[0]?.provider, 'Canva');
      assert(
        embeds[0]?.title === 'Canva design' || embeds[0]?.title === 'Canva',
      );
    },
  );

  await run(
    'Plain https site still produces no embed when EMBED_LINKS is denied',
    async () => {
      const embeds = await buildLinkEmbedsFromPlainText(
        'see https://example.com/path',
        { allow: false },
      );
      assert.equal(embeds.length, 0);
    },
  );

  if (YOUTUBE_INTEGRATION_ENABLED) {
    await run(
      'v2 contentJson link href unfurls YouTube when plain text omits URL',
      async () => {
        const contentJson = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'see ' },
                {
                  type: 'text',
                  text: 'this clip',
                  marks: [
                    {
                      type: 'link',
                      attrs: {
                        href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        };
        const embeds = await buildLinkEmbedsFromPlainText('see this clip', {
          allow: true,
          contentJson,
          budgetMs: 8000,
        });
        assert.equal(embeds.length, 1);
        assert.equal(embeds[0]?.video?.kind, 'youtube');
        assert(
          embeds[0]?.video?.embedUrl?.includes('youtube-nocookie.com/embed/'),
        );
      },
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      'skip v2 contentJson link href unfurls YouTube (integration disabled)',
    );
  }

  await run('rejects plain http unfurl targets', () => {
    assert.equal(isUrlSafeForOutboundFetch('http://example.com/path'), false);
    assert.equal(isUrlSafeForOutboundFetch('https://example.com/path'), true);
  });

  await run('rejects loopback and private IPv6 unfurl targets', () => {
    assert.equal(isUrlSafeForOutboundFetch('http://[::1]/health'), false);
    assert.equal(isUrlSafeForOutboundFetch('http://[fd00::1]/internal'), false);
    assert.equal(isUrlSafeForOutboundFetch('http://[fe80::1]/internal'), false);
    assert.equal(
      isUrlSafeForOutboundFetch('https://[2001:4860:4860::8888]/dns-query'),
      true,
    );
  });

  await run('rejects IPv4-mapped IPv6 private unfurl targets', () => {
    assert.equal(
      isUrlSafeForOutboundFetch('http://[::ffff:127.0.0.1]/health'),
      false,
    );
    assert.equal(
      isUrlSafeForOutboundFetch('http://[::ffff:10.0.0.1]/internal'),
      false,
    );
    assert.equal(
      isUrlSafeForOutboundFetch(
        'http://[::ffff:169.254.169.254]/latest/meta-data',
      ),
      false,
    );
    assert.equal(isPrivateOrLocalIpLiteral('::ffff:127.0.0.1'), true);
    assert.equal(isPrivateOrLocalIpLiteral('::ffff:10.0.0.1'), true);
    assert.equal(isPrivateOrLocalIpLiteral('::ffff:169.254.169.254'), true);
  });

  await run('rejects IPv4-compatible and NAT64 private literals', () => {
    assert.equal(isPrivateOrLocalIpLiteral('::7f00:1'), true);
    assert.equal(isPrivateOrLocalIpLiteral('::127.0.0.1'), true);
    assert.equal(isPrivateOrLocalIpLiteral('64:ff9b::10.0.0.1'), true);
    assert.equal(
      isUrlSafeForOutboundFetch('https://[64:ff9b::127.0.0.1]/'),
      false,
    );
    assert.equal(isUrlSafeForOutboundFetch('https://[::7f00:1]/'), false);
  });

  process.exit(failed ? 1 : 0);
}

void main();
