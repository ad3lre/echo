import { ref } from 'vue';
import DOMPurify from 'dompurify';
import {
  ensureDisplayStyleForOperatorLimits,
  normalizeKatexDisplaySpacing,
  normalizeKatexInput,
} from '@/features/chat/markdown/normalizeKatexInput';

export const MARKDOWN_KATEX_PIPELINE_VERSION = 'katex-shared1';

const MAX_KATEX_SOURCE_CHARS = 3000;
const MAX_RENDER_CACHE_ENTRIES = 512;

type KatexModule = (typeof import('katex'))['default'];

let katexModule: KatexModule | null = null;
let katexLoadPromise: Promise<void> | null = null;
const katexRenderCache = new Map<string, string>();
const katexSafeRenderCache = new Map<string, string>();

export const markdownKatexReadyVersion = ref(0);

const KATEX_ONLY_SANITIZE_OPTS = {
  ALLOWED_TAGS: [
    'span',
    'div',
    'svg',
    'path',
    'line',
    'math',
    'semantics',
    'annotation',
    'mrow',
    'mi',
    'mn',
    'mo',
    'mtext',
    'ms',
    'mspace',
    'mfrac',
    'msqrt',
    'mroot',
    'msub',
    'msup',
    'msubsup',
    'munder',
    'mover',
    'munderover',
    'mtable',
    'mtr',
    'mtd',
    'mstyle',
    'mpadded',
    'mphantom',
    'menclose',
    'mglyph',
  ],
  ALLOWED_ATTR: [
    'class',
    'style',
    'aria-hidden',
    'xmlns',
    'display',
    'encoding',
    'mathvariant',
    'mathsize',
    'mathcolor',
    'viewBox',
    'preserveAspectRatio',
    'd',
    'x1',
    'y1',
    'x2',
    'y2',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'fill',
    'focusable',
    'width',
    'height',
  ],
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

let katexOnlyStyleSanitizerHookInstalled = false;

const DANGEROUS_INLINE_STYLE_DECLARATION_RE =
  /url\s*\(|expression\s*\(|image-set\s*\(|@import|behavior\s*:|-moz-binding|position\s*:\s*(?:fixed|sticky)|z-index|clip-path|mask(?:-image)?\s*:|-webkit-mask/i;

function filterDangerousInlineStyleDeclarations(raw: string): string {
  if (!raw) return '';
  return raw
    .split(';')
    .map((decl) => decl.trim())
    .filter((decl) => decl.length > 0)
    .filter((decl) => !DANGEROUS_INLINE_STYLE_DECLARATION_RE.test(decl))
    .join('; ');
}

/**
 * KaTeX needs inline style for layout, but arbitrary user HTML must not regain
 * overlay or network-fetch CSS through the shared sanitizer.
 */
export function ensureKatexOnlyStyleSanitizerHook(): void {
  if (katexOnlyStyleSanitizerHookInstalled) return;
  katexOnlyStyleSanitizerHookInstalled = true;
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName !== 'style') return;
    let el = node as Element | null;
    let allowed = false;
    while (el) {
      if (el.classList?.contains('katex')) {
        allowed = true;
        break;
      }
      el = el.parentElement;
    }
    if (!allowed) {
      data.keepAttr = false;
      return;
    }
    const filtered = filterDangerousInlineStyleDeclarations(data.attrValue);
    if (!filtered) {
      data.keepAttr = false;
      return;
    }
    data.attrValue = filtered;
  });
}

function getCachedString(
  cache: Map<string, string>,
  key: string,
): string | undefined {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function setCachedString(
  cache: Map<string, string>,
  key: string,
  value: string,
): string {
  if (cache.size >= MAX_RENDER_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

function escapeKatexFallback(latex: string): string {
  return latex
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** KaTeX's renderer is loaded only when math is present; its layout CSS loads at app startup. */
export function ensureMarkdownKatexLoaded(): void {
  if (katexModule || katexLoadPromise) return;
  katexLoadPromise = import('katex')
    .then((mod) => {
      katexModule = (mod.default ?? mod) as KatexModule;
      markdownKatexReadyVersion.value += 1;
    })
    .catch(() => {
      katexLoadPromise = null;
    });
}

export async function ensureMarkdownKatexReady(): Promise<void> {
  if (katexModule) return;
  ensureMarkdownKatexLoaded();
  await katexLoadPromise;
}

export function isMarkdownKatexReady(): boolean {
  return katexModule != null;
}

function renderMarkdownKatexPlaceholderHtml(
  latex: string,
  displayMode: boolean,
): string {
  const tag = displayMode ? 'div' : 'span';
  return `<${tag} class="katex-pending">${escapeKatexFallback(latex)}</${tag}>`;
}

export function renderMarkdownKatexHtml(
  latex: string,
  displayMode: boolean,
): string {
  const normalized = normalizeKatexInput(latex);
  const spaced = displayMode
    ? normalizeKatexDisplaySpacing(normalized)
    : normalized;
  const src = ensureDisplayStyleForOperatorLimits(spaced, displayMode);
  const key = `${displayMode ? 'd' : 'i'}:${src}`;
  const hit = getCachedString(katexRenderCache, key);
  if (hit !== undefined) return hit;

  if (!katexModule) {
    ensureMarkdownKatexLoaded();
    return renderMarkdownKatexPlaceholderHtml(src, displayMode);
  }

  const renderSrc =
    src.length > MAX_KATEX_SOURCE_CHARS
      ? `${src.slice(0, MAX_KATEX_SOURCE_CHARS)}\\text{...}`
      : src;
  try {
    return setCachedString(
      katexRenderCache,
      key,
      katexModule.renderToString(renderSrc, {
        displayMode,
        throwOnError: false,
        trust: false,
        strict: false,
        output: 'htmlAndMathml',
        maxExpand: 2000,
        maxSize: 20,
      }),
    );
  } catch {
    return `<span class="katex-error" title="Math render error">\\text{...}</span>`;
  }
}

export function renderMarkdownKatexSafeHtml(
  latex: string,
  displayMode: boolean,
): string {
  const normalized = normalizeKatexInput(latex);
  const spaced = displayMode
    ? normalizeKatexDisplaySpacing(normalized)
    : normalized;
  const src = ensureDisplayStyleForOperatorLimits(spaced, displayMode);
  const key = `${displayMode ? 'd' : 'i'}:${src}:safe`;
  const hit = getCachedString(katexSafeRenderCache, key);
  if (hit !== undefined) return hit;

  ensureKatexOnlyStyleSanitizerHook();
  return setCachedString(
    katexSafeRenderCache,
    key,
    DOMPurify.sanitize(
      renderMarkdownKatexHtml(latex, displayMode),
      KATEX_ONLY_SANITIZE_OPTS,
    ),
  );
}
