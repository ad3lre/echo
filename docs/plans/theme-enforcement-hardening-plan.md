# Theme enforcement hardening — execution plan

This plan turns the theme system from **architecturally correct** into **actually closed**: fewer parallel styling universes, CI that catches regressions, and explicit handling of edge tokens and future theme ids.

**Baseline status:** See `[theme-system-progress.md](./theme-system-progress.md)`.

**Status (completed 2026-04-01):** Stylelint runs on `**src/**/_.{scss,vue}`** (raw color rules; `themes.css`excluded).`npm run lint:theme` (`**--max-warnings 0**`) in CI. Legacy SCSS migrated to tokens; Vue styles use `var(--…)`/`--vue-auto-\_`in`themes.css`. The temporary `**check-theme-no-raw-colors`grep script and allowlist were removed** (sunset). Remaining optional work: repo-wide ESLint without`**--quiet`**, renaming `--vue-auto-\*` to semantic names over time.

**Honest phase label:** _Single enforcement owner for SFC/SCSS colors (Stylelint); ESLint owns Tailwind literal patterns in TS/Vue strings._

**Executable checklist:** Use this document as the ordered implementation guide (editor-local todo files are intentionally not shipped in-repo).

---

## Governance (anti-drift)

- **Stylelint vs grep:** Treat **Stylelint as primary** for SCSS-shaped code long-term. The **grep script is a migration safety net** — document a **sunset trigger** in `AGENTS.md` (e.g. remove grep from CI once Stylelint covers all intended surfaces **including** Vue `<style lang="scss">`, plus a sign-off audit). Avoid running two “owners” indefinitely without a removal date.
- **Allowlist:** Grep allowlists must be **shrink-oriented** (no unbounded growth as a bypass graveyard). Encode policy in `AGENTS.md`; optional CI guard on allowlist line-count vs `main`.
- **ESLint:** Prefer **one** `eslint.config.js` for a strict theme run (env flag / conditional block / documented CLI overrides). Avoid a duplicate `eslint.theme.config.js` that can diverge on parsers and plugins. **Conditional / env-based branching is easy to run wrong locally** — mitigate by documenting **the same npm scripts CI runs** in `AGENTS.md` as the source of truth (e.g. `npm run lint:theme -w frontend`), not ad-hoc env vars alone.
- **Vue SFC SCSS:** Either **lint** `<style lang="scss">` with Stylelint (e.g. postcss-html) or **explicitly** exclude and **document** that grep (or another tool) covers that lane until included — no accidental bypass.
- **Stylelint + Vue SFC (technical risk):** PostCSS-HTML / extraction edge cases, `scoped` styles, and false positives on `var(--*)` are the usual time sinks. Prefer a **two-phase rollout** (standalone `*.scss` first, then Vue SFC + rule tuning) if needed; grep covers `.vue` styles in the gap.
- **Token migration vs enforcement:** Token expansion is an **ongoing loop**, not a task with an end date in a large codebase. **Success is primarily “no new raw colors”** (enforcement), not “zero legacy literals everywhere.”

---

## Risk summary (why this plan exists)

| Area                   | Risk                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SCSS**               | Variables/Tailwind are partly guarded; SCSS can still ship raw `hex` / `rgba` / fixed palette logic. Half the styling layer can ignore tokens.                                                                              |
| **ESLint + `--quiet`** | Warnings do not fail CI. Non-theme issues can hide in warnings; teams can also accumulate `@typescript-eslint/no-unused-vars` noise while **styling** regressions stay invisible until someone runs lint without `--quiet`. |
| **Amoled / Sunny**     | Persisted “valid” preference values with **no** distinct `[data-theme]` contract — safe only if normalization is the **single** DOM path and documented; still a footgun for future features.                               |
| **Token coverage**     | Hover, disabled, odd borders, modal shadows, and any charts later tend to reintroduce raw colors unless tokens (or documented aliases) exist.                                                                               |

---

## Guiding principles

1. **One token contract** for UI chrome: `themes.css` (+ documented legacy aliases) is source of truth; SCSS and Vue must consume `var(--…)` or semantic Tailwind, not ad-hoc literals.
2. **Enforcement is part of the design** — not a cleanup chore after the fact.
3. **Order matters:** close the **SCSS hole** and **CI strictness** before assuming “migration is done.”

---

## Phase 1 — Close the SCSS hole (highest priority)

**Goal:** SCSS is no longer a “parallel universe” for colors.

### Option A — Stylelint (recommended)

- Add **Stylelint** to the frontend workspace with:
  - `stylelint-config-standard-scss` (or equivalent for SCSS).
  - Custom rules / `declaration-property-value-disallowed-list` (or plugin) to **forbid** raw color functions in UI-layer paths, e.g. under `frontend/src/**/*.scss`, **excluding** `frontend/src/assets/themes.css` (token layer — keep allowlist in `AGENTS.md` aligned).
- Wire `npm run lint:style` (or fold into `lint`) and **run it in** `[.github/workflows/echo-frontend-ci.yml](../../.github/workflows/echo-frontend-ci.yml)`.

**Acceptance criteria**

- Stylelint runs on `frontend/src/**/*.scss` (legacy ignores removed after token migration).
- Vue `<style lang="scss">` in Stylelint (`postcss-html`); grep script **sunset** 2026-04-01.
- `themes.css` excluded from Stylelint (token layer).
- CI fails on new forbidden literals in non-ignored SCSS (`echo-frontend-ci.yml` → `lint:style`).

### Option B — Gradual migration + grep gate (lighter weight)

- Keep migrating SCSS to `var(--token)` file-by-file.
- Add a **CI script** (see Phase 5) that greps SCSS for `#[0-9a-fA-F]{3,8}` and `rgba?(` with an allowlist file listing grandfathered lines until zero.

**Acceptance criteria**

- ~~CI fails on **new** violations outside allowlist (`check:theme-raw-colors`)~~ — **superseded:** Stylelint + `lint:theme`; grep removed 2026-04-01.

**Recommendation:** Prefer **Option A** long-term; use **Option B** as a bridge if Stylelint setup is blocked.

---

## Phase 2 — Tighten Tailwind / TS enforcement (remove silent rot)

**Goal:** CI fails when styling rules are violated; don’t rely on `--quiet` to hide warning volume forever.

### Step 2a — Split lint scripts

- `lint:theme` — ESLint with **only** (or primarily) theme-related rules, **no `--quiet`**, `**--max-warnings 0**` for that run.
- `lint` — full ESLint: either fix warnings across the repo and remove `--quiet`, **or** keep full lint as warnings-only **until** a cleanup sprint, but **CI must run `lint:theme` strictly**.

### Step 2b — Cleanup pass (enables stricter default)

- Drive `@typescript-eslint/no-unused-vars` and other noisy rules down so `eslint src --max-warnings 0` is realistic for the whole tree, then **remove `--quiet`** from the default `lint` script.

**Acceptance criteria**

- CI runs a **zero-warnings** pass for theme-related ESLint rules (`npm run lint:theme -w frontend`).
- `AGENTS.md` documents the **exact** npm scripts that match CI, including `lint:theme`.
- Repo-wide `lint` without `--quiet` / full-tree `max-warnings 0` — **still open** (Step 2b).

---

## Phase 3 — Amoled / Sunny — explicit contract (no “phantom product state”)

**Goal:** No ambiguity between “stored preference” and “what the renderer uses.”

### Actions

1. **Document** in `AGENTS.md` + `theme-system-progress.md`: Amoled/Sunny are **placeholders**; DOM/CSS only `dark` | `light` until palettes ship.
2. **Code guardrails (optional hardening):**

- Ensure **every** path that could set `dataset.theme` goes through `applyThemeToDocument` + canonical type (already the case — add a short comment or a dev-only assert).
- In settings UI, keep disabled options **or** map selection to canonical preview only until CSS blocks exist.

3. **When product adds Amoled/Sunny:** add `[data-theme="amoled"]` (or namespaced canonical ids) in `themes.css` **and** extend `resolveCanonicalTheme` in one place — still one resolver → DOM.

**Acceptance criteria**

- Docs state the invariant explicitly (`AGENTS.md`, `theme-system-progress.md`).
- No second code path writes `dataset.theme` without normalization — assignment only in `applyThemeToDocument()` (`frontend/src/utils/theme.ts`).

---

## Phase 4 — Token coverage expansion (ongoing loop)

**Goal:** Legitimate states (hover, disabled, focus rings, modal scrims, future data viz) have a **named token** or alias so engineers don’t reach for raw values — **without** treating “migrate every legacy color” as a blocking finish line.

### Actions

1. **Inventory gaps** during code review + audit (Phase 5): list repeated raw colors.
2. **Add tokens** to `themes.css` per theme (e.g. `--state-hover`, `--state-disabled`, `--focus-ring`, or reuse `--muted` / `--border` with documented intent).
3. **Expose** in Tailwind `@theme` where utilities help.
4. **Migrate** call sites opportunistically; extend Stylelint/ESLint disallow lists if patterns repeat.

**Acceptance criteria**

- **Enforcement** prevents **new** raw colors in scoped paths (primary metric).
- New UI states prefer tokens; exceptions documented with ticket + `eslint-disable` / stylelint comment where unavoidable.
- Legacy surface **shrinks over time**; “zero literals repo-wide” is aspirational, not a release gate.

---

## Phase 5 — Full color audit + “token-only” CI check

**Goal:** One-time cleanup + ongoing guardrail.

### Audit (manual + scripted)

Search under `frontend/src` (respecting `AGENTS.md` allowlist):

- Hex: `#rgb`, `#rrggbb`, etc.
- Functional: `rgb(`, `rgba(`, `hsl(`, `oklch(`
- Tailwind palette utilities: `gray-`, `slate-`, `zinc-`, `neutral-`, `stone-`, `bg-black`, `text-white` (ESLint already covers some string literals; audit catches SCSS and `<style>` blocks).

### Grep-based CI (minimum viable “token-only test”)

- Add `scripts/check-theme-no-raw-colors.mjs` (or similar) that:
  - Scans allowed paths.
  - Ignores `themes.css`, `index.html` boot splash (per `AGENTS.md`), and an optional `allowlist.txt` of remaining lines.
  - Exits non-zero on new matches.

Run in **frontend CI** after Stylelint/ESLint or as a fallback if Stylelint is deferred.

**Acceptance criteria**

- Temporary grep script + allowlist shipped and **sunset 2026-04-01** — removed after Stylelint covered `*.vue` styles; CI now relies on `npm run lint:style -w frontend` only for SCSS/Vue style literals.

---

## Suggested order of execution

| Order | Phase                                                         | Rationale                                                                              |
| ----- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1     | **Phase 1** (SCSS / Stylelint or grep gate)                   | Biggest structural hole; unlocks “closed” system.                                      |
| 2     | **Phase 5** (audit + grep CI)                                 | Cheap signal; complements Stylelint and catches Vue `<style lang="scss">` / odd files. |
| 3     | **Phase 2** (`lint:theme` strict + eventually drop `--quiet`) | Stops slow Tailwind/class string rot.                                                  |
| 4     | **Phase 3** (Amoled/Sunny docs + DOM path audit)              | Low cost; prevents future bugs.                                                        |
| 5     | **Phase 4** (tokens as gaps appear)                           | Ongoing; driven by audit and new features.                                             |

---

## References

- `[AGENTS.md](../AGENTS.md)` — token vs UI layer boundary.
- `[theme-system-progress.md](./theme-system-progress.md)` — what shipped already.
- `[frontend/eslint.config.js](../frontend/eslint.config.js)` — current Tailwind literal rules.
- `[.github/workflows/echo-frontend-ci.yml](../../.github/workflows/echo-frontend-ci.yml)` — where new checks plug in.

---

_This is an execution plan, not a commitment calendar. Adjust phases if Stylelint scope or team capacity dictates a grep-first approach. Progress vs checkboxes verified 2026-04-01 against CI and `frontend/` tooling._
