import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildEchoInviteShareHtml,
  escapeHtmlAttributeValue,
} from '../services/echoInviteSharePage';

function run(): void {
  const payload = '<script>alert(1)</script>" onload="evil"';
  assert.equal(
    escapeHtmlAttributeValue(payload),
    '&lt;script&gt;alert(1)&lt;/script&gt;&quot; onload=&quot;evil&quot;',
  );

  const html = buildEchoInviteShareHtml({
    preview: {
      name: payload,
      description: payload,
      memberCount: 2,
      iconUrl: '',
      bannerUrl: '',
      voiceChannel: { name: payload, id: 'vc1' },
    },
    canonicalAppBase: 'https://echo.example',
    landingPath: '/test-server',
    apiPublicBase: 'https://api.echo.example',
  });

  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('onload="evil"'));

  const botSource = readFileSync(
    path.join(__dirname, '../api/routes/echo/echoBotApplications.ts'),
    'utf8',
  );
  assert.match(
    botSource,
    /Only the bot owner can install this bot/,
    'bot install must require owner',
  );
  assert.match(botSource, /owner_user_id.*!== userId/);

  console.log('echoInviteSharePage.xss + botApplications.idor: ok');
}

run();
