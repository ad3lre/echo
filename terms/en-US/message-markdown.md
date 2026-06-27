# Message formatting

Echo chat uses **GitHub-Flavored Markdown** plus Echo-specific extras (spoilers, highlights, alerts, mentions, ID tokens, and more). Copy any block below into a message.

**Math (LaTeX / KaTeX)** → see **Math in messages** in this help section.

---

## Index

| Category                              | Syntax                                             |
| ------------------------------------- | -------------------------------------------------- | --- | --- | --- | --- |
| [Line breaks](#line-breaks)           | newline / blank line                               |
| [Headings](#headings)                 | `#` … `######`                                     |
| [Emphasis](#emphasis)                 | `**bold**` `*italic*` `~~strike~~` `__underline__` |
| [Highlight](#highlight)               | `==text==`                                         |
| [Code](#code)                         | `` `inline` `` ` ```lang ` `!````                  |
| [Blockquotes](#blockquotes)           | `>`                                                |
| [Alerts](#alerts)                     | `> [!NOTE]` …                                      |
| [Lists](#lists)                       | `-` `1.` `- [ ]`                                   |
| [Links & images](#links--images)      | `[text](url)` `![alt](url)`                        |
| [Tables](#tables)                     | pipe table                                         |
| [Horizontal rule](#horizontal-rule)   | `---`                                              |
| [Footnotes](#footnotes)               | `[^1]`                                             |
| [Spoilers](#spoilers)                 | `                                                  |     | …   |     | `   |
| [Broadcast labels](#broadcast-labels) | `@Everyone` `@Active`                              |
| [Mentions](#mentions)                 | picker / server data                               |
| [ID tokens](#id-tokens)               | `<@id>` `<#id>` …                                  |
| [Custom emoji](#custom-emoji)         | `:name:` `<:name:id>`                              |
| [Emoji](#emoji)                       | `😀`                                               |
| [Raw HTML](#raw-html)                 | `<sub>` `<kbd>` …                                  |
| [Limits](#limits)                     | —                                                  |

---

## Line breaks

```md
Same paragraph,
still same paragraph.

New paragraph needs a blank line above.
```

Single newlines inside a paragraph usually render as line breaks.

---

## Headings

```md
# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6
```

Headings get stable anchor IDs when possible (`#my-heading`, duplicates → `-2`, `-3`, …).

---

## Emphasis

```md
**bold**
_italic_ or _italic_
~~strikethrough~~
**underline** ← Echo uses ** for underline, not bold
**_bold italic_**
\*\***bold underline\*\*\_\_
```

```md
Combine them: **bold**, _italic_, **underlined**, and ~~struck~~.
```

---

## Highlight

```md
==This text is highlighted==
```

---

## Code

**Inline** — Markdown and math rules do not apply inside code:

```md
Use `backticks` for `__literal__` and `$x^2$`.
```

**Fenced** — optional language tag on the opening fence:

````md
```js
const x = 1;
console.log(x);
```

```text
||not a spoiler||
$not math$
```
````

**Markdown inside a fence** — prefix the opening fence with `!` to disable the code block and render inner lines with full markdown (headings, bold, spoilers, math, etc.). Echo strips the `!` opener and matching closer before parsing:

````md
!```

## Looks like a code block

**but this is bold**
||and this is a spoiler||

```

```
````

Without the leading `!`, everything between the fences stays literal monospace text.

---

## Blockquotes

```md
> Single line quote

> Multi-line
> quote block

> Nested
>
> > deeper
```

---

## Alerts

GitHub-style callouts (case-insensitive type):

```md
> [!NOTE]
> Useful information.

> [!TIP]
> Helpful advice.

> [!IMPORTANT]
> Key information.

> [!WARNING]
> Needs attention.

> [!CAUTION]
> Risk or negative outcome.
```

Types: `NOTE` · `TIP` · `IMPORTANT` · `WARNING` · `CAUTION`

---

## Lists

**Unordered**

```md
- Item one
- Item two
  - Nested

* Also works

- Also works
```

**Ordered** — start number is preserved:

```md
5. Fifth item (list starts at 5)
6. Sixth item
```

**Task lists** — checkboxes are read-only in chat:

```md
- [ ] Todo
- [x] Done
```

**Mixed**

```md
1. First
   - Sub-bullet
   - Another
2. Second
```

---

## Links & images

```md
[Echo docs](https://example.com/docs)
![Diagram](https://example.com/chart.png)
```

Bare URLs autolink:

```md
See https://example.com/path for details.
```

External links open in a new tab with safe `rel` attributes. Autolinked URLs may show a site favicon.

---

## Tables

```md
| Name  | Role   | Active |
| ----- | ------ | :----: |
| Alice | Admin  |   ✓    |
| Bob   | Member |   ✗    |
```

Alignment: `:---` left · `:---:` center · `---:` right

---

## Horizontal rule

```md
---
---

---
```

---

## Footnotes

```md
Echo supports footnotes[^1] inline.

[^1]:
    The note body can span
    multiple lines and use **markdown**.
```

---

## Spoilers

```md
||hidden text||
||can include **markdown** and
multiple lines||
||nested ||inner|| spoilers||
```

Spoilers are processed before Markdown. Nesting is allowed up to a safe depth.

---

## Broadcast labels

Plain text only (not the mention picker):

```md
@Everyone
@Active
```

---

## Mentions

**Picker mentions** — use `@user`, `@role`, or `#channel` from the UI. Echo styles them when the server attaches mention data. Free-typed `@alice` without that data stays plain text.

**Channel styling after Markdown** — `#general` becomes a channel pill only when a matching channel mention exists for that label:

```md
Check #general for updates
```

(Requires a real `#general` channel mention on the message.)

---

## ID tokens

Paste these to render linkable pills (labels resolve when Echo knows the ID):

```md
<@123456789012345678> user
<@!123456789012345678> user (bang ignored)
<#987654321098765432> channel
<@&111222333444555666> role
<$777888999000111222> server
<m:333444555666777888> message link
<:party_blob:304238867010606080> custom emoji
<a:spin:304238867010606081> animated emoji
<icon:shield-check.svg> in-house app icon
```

If a token overlaps a structured mention from the picker, the mention wins.

---

## Custom emoji

**Shortcode** (when the server has that emoji):

```md
Hello :party_blob: everyone
```

**Full token** (always works when pasted):

```md
<:party_blob:304238867010606080>
```

---

## Emoji

```md
Standard emoji render as Twemoji images: 😀 🎉 👍
```

Emoji styling does not run inside math output.

---

## Raw HTML

Some HTML passes through Markdown and survives sanitization:

```md
<sub>subscript</sub> and <sup>superscript</sup>
<del>deleted</del> and <ins>inserted</ins>
<kbd>Ctrl</kbd>+<kbd>C</kbd>
<abbr title="Application Programming Interface">API</abbr>
```

Allowed: common text tags, lists, links, images, tables, task-list markup, layout spans for mentions/spoilers, and KaTeX math structures.

Blocked: `<script>`, `<iframe>`, event handlers, arbitrary CSS — sanitization always wins.

---

## Math

Quick sample — full delimiter rules, dollar handling, and text-style LaTeX are in **Math in messages**:

```md
Inline $E = mc^2$ or \(a + b\)

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$
```

---

## Limits

- No Markdown or math **inside** normal code spans/blocks (stays literal). Use `!``` ` on the opening fence to opt into full markdown instead (see [Code](#code)).
- No Slack `mrkdwn` or Discord shortcuts beyond what is listed here.
- `@name` / `#name` without server mention data → plain text.
- Task list checkboxes are display-only, not shared todos.
- Legal/policy pages use a different Markdown pipeline than chat.
