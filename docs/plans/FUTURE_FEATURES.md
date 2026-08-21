# Future features

Backlog items that are partially implemented, intentionally gated, or not ready to ship. Prefer linking to code and flags from here instead of deleting work in progress.

---

## Inline composer markdown (live delimiter styling)

**What it is:** “Inline preview” in the chat composer markdown menu styles markdown _inside_ the TipTap editor—muted `**` / `` ` `` delimiters, bold/italic/code spans, headings-as-font-size, etc.—via ProseMirror decorations (`clients/web/src/features/chat/editor/composerMarkdownDecorations.ts` and `setMarkdownDecorationsEnabled` in `clients/web/src/features/chat/composables/useComposerState.ts`).

**Why it is disabled for shipping:** That path is a separate heuristic parser from the real message renderer (`parseMessageContent` in `clients/web/src/features/chat/markdown/useMarkdown.ts`, used for split/full preview and sent-message display). Styling and edge cases diverge, which reads as “broken” coloring and typography compared to split preview. Shipping it would set the wrong expectation and add support burden.

**Split/full preview** still uses the same HTML pipeline as messages and remains available.

**How to turn it back on:** Set `INLINE_MARKDOWN_PREVIEW_UI_ENABLED` to `true` in `clients/web/src/features/chat/composables/markdownPreviewModePreference.ts`. The menu item reappears; `inline` in localStorage is already a valid stored mode and will apply once the flag is on. Before enabling, align behavior with `parseMessageContent` (or drive decorations from a shared tokenizer) and add regression tests for mentions, spoilers, and invite/jump URL splits.

---

## Adding entries

When parking a feature, note: user-visible name, file/flag location, why it is off, and what “done” looks like.
