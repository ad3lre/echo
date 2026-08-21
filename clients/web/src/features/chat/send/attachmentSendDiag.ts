/**
 * Records the attachment URLs of the most recent outbound message emit so that a
 * subsequent `message_failed` (VALIDATION) can surface *which* URL the server
 * rejected. The generic "attachments malformed or too many" error is otherwise
 * undebuggable from the UI alone. Sends are sequential and the failure arrives
 * immediately after the emit, so "last emitted" reliably identifies the culprit.
 */
let lastEmittedAttachmentUrls: string[] = [];

export function recordEmittedAttachmentUrls(urls: readonly string[]): void {
  lastEmittedAttachmentUrls = urls.slice(0, 10).map((u) => String(u ?? ''));
}

/** Compact, log-safe description (scheme + host + truncated path) for diagnostics. */
export function describeLastEmittedAttachmentUrls(): string {
  if (!lastEmittedAttachmentUrls.length) return '';
  return lastEmittedAttachmentUrls
    .map((u) => {
      if (!u) return '(empty)';
      if (u.length <= 96) return u;
      return `${u.slice(0, 96)}…`;
    })
    .join(' | ');
}
