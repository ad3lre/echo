# Echo theme system — progress and remaining work

**Doc verified:** 2026-03-27 — enforcement stack (Stylelint, ESLint `lint:theme`, token layer) unchanged since 2026-04-01 closure notes below.

**Enforcement hardening narrative:** `[theme-enforcement-hardening-plan.md](./theme-enforcement-hardening-plan.md)`.

---

## Completed (theme system closure)

### Runtime and state (Rule B)

- **Canonical DOM only:** `document.documentElement.dataset.theme` is `dark` or `light` only; `resolveCanonicalTheme()` in `clients/web/src/features/settings/theme.ts` normalizes all input.
- **Single writer:** Only `applyThemeToDocument()` assigns `dataset.theme` (`main.ts`, `useThemeStore`).
- **Early paint, Pinia store, OS sync:** As before (`main.ts`, `clients/web/src/features/settings/themeStore.ts`).

### Tokens and Tailwind

- **Palette:** `clients/web/src/assets/themes.scss` (+ partials under `themes/`) — core tokens, glass/legacy aliases, DM/call chrome, markdown/mention/VC/settings/server-settings composites, explore/slowmode helpers, and `**--vue-auto-*`\*\* entries mapping former Vue inline/style literals (both themes).
- **Tailwind bridge:** `clients/web/src/assets/tailwind.css` `@theme` utilities.

### UI migration

- Legacy SCSS (`main.scss`, channel panel, message bubbles, settings + server settings modals) uses `var(--…)` only; raw literals live in `themes.scss`.
- Vue SFC `<style>` blocks: literals replaced with `var(--vue-auto-*)` or named tokens; inline template colors removed where Stylelint parsed them (e.g. ExploreView, ChatInput slowmode).

### Enforcement and CI

- **ESLint:** `clients/web/eslint.config.js` — Vue essential + theme `no-restricted-syntax` on `*.vue` / `*.ts`; `npm run lint -w web` uses `--quiet`.
- `**npm run lint:theme -w web`:\*\* `ESLINT_THEME_STRICT=1`, `--max-warnings 0`.
- **Stylelint:** `clients/web/stylelint.config.mjs` — `color-no-hex` + disallowed color functions on `**/*.scss` and `**/*.vue` (`postcss-scss` / `postcss-html`); `themes.scss` + `themes/**` ignored.
- **Grep script sunset:** `server/ops/scripts/check-theme-no-raw-colors.mjs` and `server/ops/scripts/theme-raw-colors-allowlist.txt` **removed**; CI relies on Stylelint + ESLint only.

### Documentation

- **[agents.md](../overview/agents.md):** Token boundary, commands, DOM invariant, sunset note.

---

## Optional follow-ups (not blockers)

| Area                                  | Notes                                                                 |
| ------------------------------------- | --------------------------------------------------------------------- |
| **Semantic rename of `--vue-auto-*`** | Replace numbered aliases with meaningful names as you touch features. |
| **Default `lint` without `--quiet`**  | Fix remaining ESLint warnings/errors repo-wide, then drop `--quiet`.  |
| **Four DOM themes (Amoled/Sunny)**    | Product decision; would extend `themes.css` + resolver.               |
| **Server-backed theme**               | Optional sync across devices.                                         |

---

## Light mode + Mac-style glass (2026)

- `**[data-theme='light']`** in `themes.css` includes Mac-glass chat tokens, warm shadows, `--echo-rail-corner-*` (full light liquid-glass family), and `**--ui-\*` semantic ramps** (`--ui-fg`, `--ui-glass-1…3`, `--ui-scrim-1/2`) mirrored on default dark and tightened on AMOLED.
- **Tailwind** (`tailwind.css` `@theme`): `text-fg`, `text-fg-soft`, `text-fg-subtle`, `bg-glass-`_, `hover:bg-glass-hover`, `bg-scrim-_`, `bg-overlay-heavy`, `bg-overlay-ink`, etc. Prefer these over `text-white/…`, `bg-white/…`, `bg-black/…` in Vue class strings.
- **Theme Lab (dev only):** `ThemeLab.vue` + button in `App.vue` when `import.meta.env.DEV` — toggles Light / Dark / AMOLED and shows token swatches.
- **ESLint (theme strict):** `eslint.config.js` flags `text-white/`, `bg-white/`, `bg-black/` in string literals; `npm run lint:theme -w web` must pass.

---

## Key file reference

| Piece                | Location                                          |
| -------------------- | ------------------------------------------------- |
| Resolver + DOM write | `clients/web/src/features/settings/theme.ts`      |
| Store                | `clients/web/src/features/settings/themeStore.ts` |
| Bootstrap            | `clients/web/src/main.ts`                         |
| Tokens               | `clients/web/src/assets/themes.scss`              |
| Tailwind             | `clients/web/src/assets/tailwind.css`             |
| ESLint               | `clients/web/eslint.config.js`                    |
| Stylelint            | `clients/web/stylelint.config.mjs`                |
| Frontend CI          | `.github/workflows/echo-web-ci.yml`               |
| Contributor rules    | `AGENTS.md`                                       |

---

_Last updated: theme system completion pass (Stylelint + Vue, grep sunset, SCSS migration)._
