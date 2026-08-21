/**
 * Discord embed description / field-value markdown (subset of message formatting).
 * @see https://discord.com/developers/docs/reference#message-formatting
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slotToken(kind: 'E' | 'B' | 'I', index: number): string {
  return `\x00${kind}${index}\x00`;
}

function restoreSlots(html: string, slots: string[]): string {
  return html.replace(/\x00([EBI])(\d+)\x00/g, (_, _kind, idx) => {
    const i = Number(idx);
    return Number.isFinite(i) && slots[i] != null ? slots[i]! : '';
  });
}

type ProtectedText = {
  text: string;
  slots: string[];
};

type ProtectMode = 'markdown' | 'html';

/** Protect backslash escapes, fenced blocks, and inline code from inline formatting. */
function protectDiscordInlineRegions(
  raw: string,
  mode: ProtectMode = 'markdown',
): ProtectedText {
  const slots: string[] = [];
  let s = mode === 'html' ? escapeHtml(raw) : raw;

  s = s.replace(/\\([\\*_~`|])/g, (match, ch: string) => {
    const i = slots.length;
    slots.push(mode === 'html' ? escapeHtml(ch) : match);
    return slotToken('E', i);
  });

  s = s.replace(
    /```(?:([a-zA-Z0-9_+-]+)\n)?([\s\S]*?)```/g,
    (match, lang: string | undefined, body: string) => {
      const i = slots.length;
      if (mode === 'html') {
        const langClass = lang
          ? ` class="language-${escapeHtml(lang.trim())}"`
          : '';
        slots.push(
          `<pre class="discord-embed-md-pre"><code${langClass}>${body}</code></pre>`,
        );
      } else {
        slots.push(match);
      }
      return slotToken('B', i);
    },
  );

  s = s.replace(/`([^`\n]+?)`/g, (match, code: string) => {
    const i = slots.length;
    if (mode === 'html') {
      slots.push(`<code class="discord-embed-md-inline">${code}</code>`);
    } else {
      slots.push(match);
    }
    return slotToken('I', i);
  });

  return { text: s, slots };
}

function applyDiscordUnderlineFormats(text: string): string {
  const rules: Array<[RegExp, string]> = [
    [/__(\*\*\*(.+?)\*\*\*)__/g, '<u><strong><em>$2</em></strong></u>'],
    [/__(\*\*(.+?)\*\*)__/g, '<u><strong>$2</strong></u>'],
    [/__(\*(.+?)\*)__/g, '<u><em>$2</em></u>'],
    [/__(.+?)__/g, '<u>$1</u>'],
  ];
  let out = text;
  for (const [re, rep] of rules) {
    out = out.replace(re, rep);
  }
  return out;
}

function applyDiscordTextFormats(text: string): string {
  let out = applyDiscordUnderlineFormats(text);
  const rules: Array<[RegExp, string]> = [
    [/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>'],
    [/\*\*(.+?)\*\*/g, '<strong>$1</strong>'],
    [/~~(.+?)~~/g, '<s>$1</s>'],
    [/(?<![a-zA-Z0-9])\*(.+?)\*(?![a-zA-Z0-9])/g, '<em>$1</em>'],
    [/(?<![a-zA-Z0-9])_(.+?)_(?![a-zA-Z0-9])/g, '<em>$1</em>'],
  ];
  for (const [re, rep] of rules) {
    out = out.replace(re, rep);
  }
  return out;
}

/**
 * Convert Discord `__underline__` syntax to `<u>` before Echo markdown (GFM) runs.
 * GFM treats `__` as bold; Discord treats it as underline.
 */
export function preprocessDiscordUnderlinesForMarkdown(raw: string): string {
  if (!raw) return '';
  const protectedText = protectDiscordInlineRegions(raw);
  let s = applyDiscordUnderlineFormats(protectedText.text);
  s = restoreSlots(s, protectedText.slots);
  return s;
}

/** Parse Discord embed markdown into safe HTML (no DOMPurify — sanitize in the client). */
export function parseDiscordEmbedMarkdownToHtml(raw: string): string {
  if (!raw) return '';

  const protectedText = protectDiscordInlineRegions(raw, 'html');
  let s = protectedText.text;

  s = s.replace(/\|\|([\s\S]+?)\|\|/g, '<span class="spoiler">$1</span>');
  s = applyDiscordTextFormats(s);
  s = s.replace(/\n/g, '<br>');

  return restoreSlots(s, protectedText.slots);
}
