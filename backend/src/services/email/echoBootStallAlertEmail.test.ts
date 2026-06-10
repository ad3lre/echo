import assert from 'node:assert/strict';
import {
  BOOT_STALL_ALERT_KINDS,
  sendBootStallAlertEmail,
} from './echoBootStallAlertEmail';

async function run(): Promise<void> {
  assert.equal(BOOT_STALL_ALERT_KINDS.length, 3);
  assert.equal(
    BOOT_STALL_ALERT_KINDS.includes('boot_gate_settled_still_visible'),
    true,
  );

  const logs: { level: string; payload: unknown }[] = [];
  const log = {
    info: (payload: unknown) => logs.push({ level: 'info', payload }),
    error: (payload: unknown) => logs.push({ level: 'error', payload }),
  };

  await sendBootStallAlertEmail(log as never, {
    kind: 'boot_gate_settled_still_visible',
    clientMeta: { url: 'https://chat-echo.com/' },
    timingMeta: { msSinceMount: 1800 },
    stateMeta: { showBootGate: true, initialLoadSettled: true },
    requestIp: '127.0.0.1',
    userAgent: 'vitest',
  });

  const sent = logs.find(
    (entry) =>
      entry.level === 'info' &&
      typeof entry.payload === 'object' &&
      entry.payload !== null &&
      (entry.payload as { msg?: string }).msg ===
        'echo_boot_stall_alert_email_sent',
  );
  assert.ok(sent);
  console.log('echoBootStallAlertEmail: ok');
}

void run();
