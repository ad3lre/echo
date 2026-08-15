const sharedDomParser: DOMParser | null =
  typeof window !== 'undefined' ? new DOMParser() : null;

const UNSAFE_URI_ATTR_RE = /^(?:javascript|vbscript):/i;

function isInKatexLayoutSubtree(el: Element): boolean {
  let cur: Element | null = el;
  while (cur) {
    for (const cls of cur.classList) {
      if (cls === 'katex' || cls.startsWith('katex-')) return true;
    }
    cur = cur.parentElement;
  }
  return false;
}

/** Trusted first-party SVG (KaTeX fences + GitHub-style alert icons). */
function isTrustedSvgSubtree(el: Element): boolean {
  if (isInKatexLayoutSubtree(el)) return true;
  let cur: Element | null = el;
  while (cur) {
    // Require the explicit icon class (not bare `.md-alert`) so forged wrappers
    // cannot smuggle arbitrary SVG past the strip.
    if (cur.classList?.contains('md-alert__icon')) return true;
    cur = cur.parentElement;
  }
  return false;
}

/** Strip dangerous href/src, event handlers, non-KaTeX inline styles, and untrusted SVG after DOMPurify. */
export function postSanitizeMessageHtml(html: string): string {
  if (
    !html ||
    (!html.includes('href=') &&
      !html.includes('src=') &&
      !html.includes('style=') &&
      !html.includes('<svg') &&
      !/\son\w+\s*=/.test(html))
  ) {
    return html;
  }
  if (typeof window === 'undefined' || !sharedDomParser) return html;
  try {
    const doc = sharedDomParser.parseFromString(
      `<div id="echo-md-post-sanitize">${html}</div>`,
      'text/html',
    );
    const root = doc.getElementById('echo-md-post-sanitize');
    if (!root) return html;
    for (const el of [...root.querySelectorAll('svg, path, line')]) {
      if (!isTrustedSvgSubtree(el)) el.remove();
    }
    for (const el of root.querySelectorAll('*')) {
      for (const { name, value } of [...el.attributes]) {
        if (/^on/i.test(name)) {
          el.removeAttribute(name);
          continue;
        }
        if (name === 'style' && !isInKatexLayoutSubtree(el)) {
          el.removeAttribute(name);
          continue;
        }
        if (name !== 'href' && name !== 'src') continue;
        const compact = value.replace(/\s+/g, '').toLowerCase();
        if (
          UNSAFE_URI_ATTR_RE.test(compact) ||
          (name === 'href' && compact.startsWith('data:'))
        ) {
          el.removeAttribute(name);
        }
      }
    }
    return root.innerHTML;
  } catch {
    return html;
  }
}
