# Message formatting (Markdown in Echo chat)

Echo turns message text into rich HTML using **Markdown** in the **GitHub-Flavored** style: **bold**, _italic_, lists, links, tables, task lists, footnotes, and more. **Single line breaks** inside a paragraph usually show as line breaks on screen.

This page describes **what Echo supports on purpose**, **rough processing order** (so expectations match reality), and **where support stops**.

For **math** (LaTeX delimiters, dollar rules, bare environments, limits, and text-style LaTeX outside math), open **Math in messages** in the same help section.

---

## Processing order (why it matters)

For a typical message, Echo applies steps in roughly this order:

1. **Spoilers** — `||…||` regions are handled first where they do not clash with structured mentions.
2. **Structured mentions** — data from the server (who you @-mentioned) and pasted ID tokens like `<@…>` are turned into safe HTML **before** Markdown runs.
3. **`@Everyone` / `@Active`** — plain-text broadcast labels become styled text (not the same as picking a person).
4. **`==highlight==`** — becomes highlighted text before Markdown.
5. **Math** — LaTeX blocks are found and set aside so Markdown does not break them; KaTeX runs later (see **Math in messages**).
6. **Text-style LaTeX** — a **narrow** pass turns a few commands such as `\section` or `\begin{tabular}` into safe structure **outside** math (see **Math in messages**).
7. **Markdown** — headings, emphasis, code, quotes, lists, links, images, tables, footnotes, etc.
8. **`#channel` styling** — after Markdown, a plain `#name` can become a channel-style label **only** when the server already attached a matching channel mention for that label (random `#words` stay normal text).
9. **Spoiler bodies** — inner content is finished with the same rules, up to a **safe depth limit**.
10. **Math output** — KaTeX HTML is dropped back in.
11. **Headings** — get stable anchors when possible (for tables of contents or future deep links).
12. **External links** — open in a **new tab** with safe `rel` attributes.
13. **Sanitization** — only allowed tags and attributes survive.
14. **Emoji** — standard emoji become consistent images **outside** math.

**Plain lines:** Very simple messages (no mentions, spoilers, footnotes, tricky punctuation, etc.) may use a **faster path** that still preserves line breaks and escaping, without running the full Markdown engine.

---

## Line breaks

- **Inside a paragraph:** one newline often becomes a visible line break.
- **Between paragraphs:** leave a **blank line** so Echo emits separate paragraphs.

---

## Headings

`#` through `######` produce heading levels 1–6. Echo assigns stable **anchors** to headings (slug from text; duplicates get `-2`, `-3`, …) when possible.

---

## Emphasis and inline styles

| You write                | Result                |
| ------------------------ | --------------------- |
| `**bold**` or `__bold__` | Bold                  |
| `*italic*` or `_italic_` | Italic                |
| `~~strikethrough~~`      | Strikethrough         |
| `` `inline code` ``      | Monospace inline code |

---

## Code blocks

- **Fenced blocks:** triple backticks or triple tildes, optional language label on the opening fence.
- **Inside fenced or inline code**, Markdown and math rules **do not** apply — `$`, `$$`, `\(`, etc. stay literal.

Echo’s math handling **skips** code regions so samples are not mistaken for formulas.

---

## Blockquotes

Lines starting with `>` form blockquotes; nesting is supported.

### Alerts

GitHub-style alerts use blockquote syntax with a type marker on the first line:

```md
> [!NOTE]
> Useful information users should know.

> [!TIP]
> Helpful advice.

> [!IMPORTANT]
> Key information for the goal.

> [!WARNING]
> Urgent info that needs attention.

> [!CAUTION]
> Advises about risks or negative outcomes.
```

Supported kinds: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION` (case-insensitive). Each renders with a colored left bar, icon, and bold title matching GitHub’s alert styling.

---

## Lists

- **Unordered:** `-`, `*`, or `+` at the start of a line.
- **Ordered:** `1.`, `2.`, …
- **Task lists:** `- [ ]` and `- [x]` render as checkboxes. In chat they are **read-only** (not a shared todo list).

---

## Links and images

- `[label](url)` → link. External links open in a **new tab** with safe defaults.
- `![alt](url)` → image, subject to allowed URL schemes and sanitization.
- **Autolinking:** bare `http://` and `https://` URLs in prose are usually turned into links where Markdown applies.

---

## Tables

Pipe tables (`| col |`) in the usual Markdown style are supported.

---

## Horizontal rule

A line containing only `---`, `***`, or `___` (with optional spaces) produces a horizontal rule.

---

## Footnotes

Reference-style footnotes: `[^label]` in the text and `[^label]: note body` elsewhere in the message.

If a message contains **no** footnote syntax, Echo may skip some of the heavier processing.

---

## Highlights

Surround text with double equals:

```md
==This appears highlighted==
```

---

## Special broadcast mentions (plain text)

When these appear as plain text (**not** inside code), Echo styles them:

- `@Everyone`
- `@Active`

These are **not** the same as choosing someone from the mention picker. Whether they notify people is still governed by server rules elsewhere.

---

## User, role, channel @mentions and `#channel` names

- **Clickable pills** for people, roles, and channels appear when the message includes **mention data from the server** (for example you used the picker). Free typing `@alice` without that data is **just text**.
- After Markdown, **`#ChannelName`** may get channel styling **only** if there is a **channel mention** whose label matches (case-insensitive). Random hashtags stay plain text.

---

## Linkable ID tokens (paste / insert)

Paste forms like:

| Kind              | Example forms                                       |
| ----------------- | --------------------------------------------------- |
| User              | `<@userId>` or `<@!userId>`                         |
| Channel           | `<#channelId>`                                      |
| Role              | `<@&roleId>`                                        |
| Server (Echo)     | `<$serverId>`                                       |
| Message ref       | `<m:messageId>`                                     |
| Custom emoji      | `<:name:id>` or `<a:name:id>` (animated)            |
| In-house app icon | `<icon:filename.svg>` from Echo’s built-in icon set |

**Overlap:** If a token overlaps a **structured mention** from the server, the mention wins and the token is not rendered there.

---

## Spoilers

Spoilers use this syntax:

```md
||hidden text||
```

- Inner content can include Markdown and math; nesting is allowed up to a **safe depth**.
- If a spoiler would **partially overlap** a structured mention, Echo avoids the risky combination and falls back to simpler handling for that message shape.

---

## Math (overview)

Inline and display **LaTeX** is rendered with **KaTeX** after math is separated from Markdown. Delimiters, dollar rules, environments, limits, and text-style LaTeX are all described under **Math in messages** in this help section.

---

## Emoji

Standard emoji in message HTML are shown with **Twemoji**-style images for a consistent look. That pass does **not** run **inside** math output.

---

## Raw HTML in Markdown

Some raw HTML is allowed in Markdown source. Echo then **filters** the result to a safe subset: common text tags, lists, links, images, tables, task-list markup, layout spans used for mentions and spoilers, and the structures KaTeX needs for math.

**Blocked:** scripts, embedded frames, most event-handler attributes, and anything outside the safe list. This is a **security** boundary, not a promise to support every HTML feature.

---

## Composer and preview

- **Sent messages** and **split / full Markdown preview** aim to match the same rules.
- The **typing overlay** in the editor is a lighter preview: it does **not** run full Markdown; it mainly escapes text and shows a few token types so spacing looks right.
- Optional **delimiter highlighting** in the rich editor may be off in some builds — when in doubt, use **split or full preview** before sending.

Static **legal / policy** pages in Echo may use **different** line-break and heading rules than chat; they are not identical pipelines.

---

## What Echo does **not** do

- **No** full Slack `mrkdwn` or every Discord shortcut beyond what you see here.
- **No** guessing users or channels from free-text `@name` or `#name` without server mention data (and no fake channel styling without a matching channel mention label).
- **No** Markdown or math **inside** code spans, except as literal characters.
- **No** guarantee that arbitrary HTML, CSS, or scripts survive — **sanitization wins**.
- **No** server-rendered chat HTML for display in this path — your client builds the view.
- **No** special footnote popovers beyond what the HTML output provides today.

For math-only limits, see **Math in messages** in the same help section.
