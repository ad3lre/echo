import type { Embed } from '@shared/types';

function mergeNonOverlapping(
  matches: { start: number; end: number; url: string; embed: Embed }[],
): { start: number; end: number; url: string; embed: Embed }[] {
  const s = [...matches].sort(
    (a, b) => a.start - b.start || b.end - a.end - (a.end - b.end),
  );
  const out: typeof matches = [];
  for (const cur of s) {
    const last = out[out.length - 1];
    if (last && cur.start < last.end) continue;
    out.push(cur);
  }
  return out;
}

/**
 * Splits `content` so each pasted message jump URL that has a resolved `echoJump` embed
 * becomes its own segment (inline mini preview). URLs must appear verbatim in `content`.
 */
export function splitContentByEchoJumpEmbeds(
  content: string,
  embeds: Embed[] | undefined,
): Array<
  { type: 'text'; text: string } | { type: 'jump'; url: string; embed: Embed }
> {
  if (!content) return [{ type: 'text', text: '' }];
  const jumps =
    embeds
      ?.filter((e) => e.echoJump && e.url?.trim())
      ?.map((e) => ({ e, url: e.url!.trim() })) ?? [];
  if (!jumps.length) return [{ type: 'text', text: content }];

  const raw: { start: number; end: number; url: string; embed: Embed }[] = [];
  for (const { e, url } of jumps) {
    let idx = content.indexOf(url);
    while (idx !== -1) {
      raw.push({ start: idx, end: idx + url.length, url, embed: e });
      idx = content.indexOf(url, idx + 1);
    }
  }
  const merged = mergeNonOverlapping(raw);
  const parts: Array<
    { type: 'text'; text: string } | { type: 'jump'; url: string; embed: Embed }
  > = [];
  let last = 0;
  for (const hit of merged) {
    if (hit.start > last) {
      parts.push({ type: 'text', text: content.slice(last, hit.start) });
    }
    parts.push({ type: 'jump', url: hit.url, embed: hit.embed });
    last = hit.end;
  }
  if (last < content.length) {
    parts.push({ type: 'text', text: content.slice(last) });
  }
  if (parts.length === 0) {
    parts.push({ type: 'text', text: content });
  }
  return parts;
}
