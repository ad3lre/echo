import assert from 'node:assert/strict';
import {
  BOOT_STALL_ALERT_KINDS,
  buildBootStallMail,
} from './echoBootStallAlertEmail';

async function run(): Promise<void> {
  assert.equal(BOOT_STALL_ALERT_KINDS.length, 3);
  assert.equal(
    BOOT_STALL_ALERT_KINDS.includes('boot_gate_settled_still_visible'),
    true,
  );

  const mail = buildBootStallMail({
    kind: 'boot_gate_settled_still_visible',
    clientMeta: { url: 'https://chat-echo.com/' },
    timingMeta: { msSinceMount: 1800 },
    stateMeta: { showBootGate: true, initialLoadSettled: true },
    requestIp: '127.0.0.1',
    userAgent: 'vitest',
  });

  assert.match(mail.subject, /boot_gate_settled_still_visible/);
  assert.match(mail.text, /Echo client boot stall detected/);
  assert.match(mail.html, /Echo client boot stall detected/);
  assert.equal(mail.attachments.length, 1);
  assert.match(mail.attachments[0]?.filename ?? '', /^echo-boot-stall-/);
  console.log('echoBootStallAlertEmail: ok');
}

void run();
