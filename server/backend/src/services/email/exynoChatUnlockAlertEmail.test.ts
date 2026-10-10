import assert from 'node:assert/strict';
import {
  buildExynoChatUnlockMail,
  summarizeUnlockClient,
} from './exynoChatUnlockAlertEmail';

async function run(): Promise<void> {
  assert.deepEqual(
    summarizeUnlockClient(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ),
    { device: 'iPhone', browser: 'Safari' },
  );
  assert.deepEqual(
    summarizeUnlockClient(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Win32',
    ),
    { device: 'Windows', browser: 'Chrome' },
  );
  assert.deepEqual(
    summarizeUnlockClient(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'MacIntel',
    ),
    { device: 'Mac', browser: 'Safari' },
  );

  const mail = buildExynoChatUnlockMail({
    unlockedAt: '2026-09-25T15:00:00.000Z',
    requestIp: '203.0.113.9',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    acceptLanguage: 'en-US',
    forwardedFor: '203.0.113.9',
    client: {
      hwid: 'hwid_test_abc123',
      platform: 'iPhone',
      timezone: 'Europe/Berlin',
    },
    request: { host: 'chat.exyno.de' },
  });

  assert.match(mail.subject, /New sign-in to chat\.exyno\.de/);
  assert.match(mail.subject, /iPhone/);
  assert.doesNotMatch(mail.subject, /hwid_test|EXYNO CHAT UNLOCK|WARNING/i);
  assert.match(mail.text, /Device:\s+iPhone/);
  assert.match(mail.text, /Browser:\s+Safari/);
  assert.match(mail.text, /203\.0\.113\.9/);
  assert.doesNotMatch(mail.text, /full dump|User-Agent:|HWID:/i);
  assert.match(mail.html, /New sign-in to chat\.exyno\.de/);
  assert.match(mail.html, /iPhone/);
  assert.doesNotMatch(mail.html, /WARNING|hwid_test_abc123|<pre/i);
  assert.equal(mail.attachments.length, 1);
  assert.match(mail.attachments[0]?.content ?? '', /hwid_test_abc123/);
  assert.match(mail.attachments[0]?.filename ?? '', /^exyno-chat-unlock-/);
  console.log('exynoChatUnlockAlertEmail: ok');
}

void run();
