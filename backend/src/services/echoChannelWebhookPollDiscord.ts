import type { EchoPollStoredDefinition } from '../domain/echoPollVotesDal';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import {
  isValidClientMessageId,
  sanitizePollForStorage,
} from '../sockets/messageValidation';

function textFromPollMedia(media: unknown): string {
  if (!media || typeof media !== 'object') return '';
  const m = media as Record<string, unknown>;
  const t = typeof m.text === 'string' ? m.text.trim() : '';
  return t;
}

/**
 * Accept Echo-native poll shape (`sanitizePollForStorage`) or Discord webhook poll layout.
 */
export function normalizeWebhookExecutePoll(
  raw: unknown,
): EchoPollStoredDefinition | undefined {
  if (raw == null) return undefined;
  const direct = sanitizePollForStorage(raw);
  if (direct) return direct;

  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const q = o.question;
  let question = '';
  if (typeof q === 'string') question = q.trim();
  else if (q && typeof q === 'object') {
    const qt = (q as { text?: unknown }).text;
    if (typeof qt === 'string') question = qt.trim();
  }
  if (!question) return undefined;

  const answersRaw = o.answers;
  if (!Array.isArray(answersRaw) || answersRaw.length < 1) return undefined;

  const options: EchoPollStoredDefinition['options'] = [];
  for (const a of answersRaw) {
    if (!a || typeof a !== 'object') return undefined;
    const ar = a as Record<string, unknown>;
    const pm = ar.poll_media;
    const text = textFromPollMedia(pm);
    if (!text) return undefined;
    let id =
      typeof ar.answer_id === 'string' && ar.answer_id.trim()
        ? ar.answer_id.trim()
        : '';
    if (!id || !isValidClientMessageId(id)) {
      id = nextEchoSnowflakeId();
    }
    options.push({ id, text });
  }

  return sanitizePollForStorage({
    question,
    options,
  });
}
