/** Build query string for GET …/messages/search (shared with tests). */
export type EchoMessageSearchQueryInput = {
  q?: string;
  channelId?: string;
  authorId?: string;
  mentions?: string;
  before?: string;
  limit?: number;
  hasType?: string;
  /** Filter to messages with a non-empty `attachments` array (`1` / `true` / `yes`). */
  hasAttachment?: string;
};

export function buildEchoMessageSearchQueryString(
  p: EchoMessageSearchQueryInput,
): string {
  const sp = new URLSearchParams();
  if (p.q != null && p.q.trim() !== '') sp.set('q', p.q.trim());
  if (p.channelId != null && p.channelId.trim() !== '')
    sp.set('channelId', p.channelId.trim());
  if (p.authorId != null && p.authorId.trim() !== '')
    sp.set('authorId', p.authorId.trim());
  if (p.mentions != null && p.mentions.trim() !== '')
    sp.set('mentions', p.mentions.trim());
  if (p.before != null && p.before.trim() !== '')
    sp.set('before', p.before.trim());
  if (p.limit != null && Number.isFinite(p.limit))
    sp.set('limit', String(Math.min(50, Math.max(1, p.limit))));
  if (p.hasType != null && p.hasType.trim() !== '')
    sp.set('hasType', p.hasType.trim());
  if (p.hasAttachment != null && p.hasAttachment.trim() !== '')
    sp.set('hasAttachment', p.hasAttachment.trim());
  return sp.toString();
}
