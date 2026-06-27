import { getInstancePolicy } from '../../config/instancePolicy';

type WindowCounter = {
  count: number;
  windowStartMs: number;
};

const registerCounter: WindowCounter = { count: 0, windowStartMs: Date.now() };
const messageCounter: WindowCounter = { count: 0, windowStartMs: Date.now() };

function rollWindow(counter: WindowCounter, windowMs: number): void {
  const now = Date.now();
  if (now - counter.windowStartMs >= windowMs) {
    counter.count = 0;
    counter.windowStartMs = now;
  }
}

function checkWindow(
  counter: WindowCounter,
  enabled: boolean,
  max: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterMs: number } {
  if (!enabled || max < 1) return { ok: true };
  rollWindow(counter, windowMs);
  if (counter.count >= max) {
    const retryAfterMs = Math.max(
      1,
      counter.windowStartMs + windowMs - Date.now(),
    );
    return { ok: false, retryAfterMs };
  }
  return { ok: true };
}

export function checkAbsoluteRegisterAllowed():
  | { ok: true }
  | { ok: false; retryAfterMs: number } {
  const cfg = getInstancePolicy().limits.http.absolute.register;
  return checkWindow(registerCounter, cfg.enabled, cfg.max, cfg.windowMs);
}

export function recordAbsoluteRegisterSuccess(): void {
  const cfg = getInstancePolicy().limits.http.absolute.register;
  if (!cfg.enabled) return;
  rollWindow(registerCounter, cfg.windowMs);
  registerCounter.count += 1;
}

export function checkAbsoluteMessageSendAllowed():
  | { ok: true }
  | { ok: false; retryAfterMs: number } {
  const cfg = getInstancePolicy().limits.http.absolute.messages;
  return checkWindow(messageCounter, cfg.enabled, cfg.max, cfg.windowMs);
}

export function recordAbsoluteMessageSend(): void {
  const cfg = getInstancePolicy().limits.http.absolute.messages;
  if (!cfg.enabled) return;
  rollWindow(messageCounter, cfg.windowMs);
  messageCounter.count += 1;
}
