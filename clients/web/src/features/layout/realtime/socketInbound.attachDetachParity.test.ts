import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Inbound hot path: every `socket.on` in attach has a matching `socket.off` in detach
 * with the same handler reference (see socketInbound.ts).
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOCKET_INBOUND = readFileSync(
  join(__dirname, 'socketInbound.ts'),
  'utf8',
);

function extractSocketEventNames(src: string, method: 'on' | 'off'): string[] {
  const re = new RegExp(`socket\\.${method}\\('([^']+)'`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push(m[1]);
  }
  return out;
}

describe('socketInbound attach / detach parity', () => {
  it('registers and tears down the same event names in the same order', () => {
    const attachBlock = SOCKET_INBOUND.slice(
      SOCKET_INBOUND.indexOf('export function attachEchoSocketInbound'),
      SOCKET_INBOUND.indexOf('export function detachEchoSocketInbound'),
    );
    const detachBlock = SOCKET_INBOUND.slice(
      SOCKET_INBOUND.indexOf('export function detachEchoSocketInbound'),
    );
    const onNames = extractSocketEventNames(attachBlock, 'on');
    const offNames = extractSocketEventNames(detachBlock, 'off');
    expect(offNames).toEqual(onNames);
    expect(new Set(onNames).size).toBe(onNames.length);
  });
});
