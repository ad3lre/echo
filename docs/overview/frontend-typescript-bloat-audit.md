# Frontend TypeScript bloat audit

> **Status (2026-09-20):** This audit was refreshed against the current
> checkout. The modularization report remains report-only because the repository
> carries existing oversized files; the god-file ratchet prevents growth.
>
> | Snapshot claim                               | Live (2026-09-20)                                                                                     |
> | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
> | Largest file was `useAppLayoutController.ts` | `useServerVoiceSession.ts` is largest at 3308 lines; the controller is now a small facade             |
> | Largest file was `AppLayout.vue`             | `ChannelPanelList.vue` is 3197 lines; `AppLayout.vue` is 2332 lines                                   |
> | 59 files ≥700; “CI fails modularity”         | 91 files ≥700; `modularity:report` is warn-only in `test:ci:guards`; growth gated by `god-file:check` |
>
> Re-run: `npm run modularity:report`, `npm run god-file:check`, `wc -l` on hotspots.
> Prefer [god-file-baselines.json](../../server/ops/scripts/god-file-baselines.json) for
> enforceable ceilings.

Systematic audit of `clients/web/src` (TypeScript and Vue SFC scripts) per the agreed axes: **A** shipped JS, **B** first-load graph, **C** maintainability / coupling, **D** duplication, **E** dependency hygiene. Evidence refreshed **2026-09-20** on this repo revision; bundle and clone measurements below remain historical where explicitly marked.

---

## Executive summary

| Axis  | Headline                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A** | Largest shipped artifacts are **Krisp WASM** (~5.9 MB minified), **`AppLayout` app chunk** (~3.4 MB minified, ~964 kB gzip), then LiveKit vendor, entry `index`, server/settings modals, and `unicode-emoji-json`.                                                                                                                                                                                                             |
| **B** | Vite already constrains **modulepreload** to the `AppLayout` shell; remaining “first load” risk is dominated by the **size of the AppLayout async chunk**, not missing lazy splits for small auth views.                                                                                                                                                                                                                       |
| **C** | **91 files** exceed the **700-line** hard threshold (`modularity:report` reports them). The largest current hotspots are `useServerVoiceSession.ts` (**3308** lines), `ChannelPanelList.vue` (**3197**), and `VcActivityStage.vue` (**3159**). **Hub imports:** `@/features/auth/authSession` appears in **78** files; `@/api/authClient` in **41** files; `@/features/layout/echoWorkspace/useEchoWorkspace` in **28** files. |
| **D** | **jscpd:** ~**2.18%** duplicated lines (3858 / ~177k logical lines in scan scope); **140** exact clones. Notable **production** overlaps: `useAppLayoutCallVoiceBridge` vs `useAppLayoutShellVoice`; **SettingsFormattingGuide** vs **SettingsLegal** (~125 lines); **CompactDualPaneShell** vs **CompactTriPaneShell**.                                                                                                       |
| **E** | The previously reported unused `vue-router` and `@tiptap/extension-character-count` dependencies are no longer present in the web workspace. `-apps/*` was removed with the Tauri shell.                                                                                                                                                                                                                                       |

---

## 1) Baseline metrics (reproducible)

### 1.1 Modularization (`npm run modularity:report`)

- Thresholds: **soft 400** lines, **hard 700** lines (Vue/TS/JS under `clients/web/src`).
- **215** files ≥ 400 lines; **91** files ≥ 700 lines. The report is visible in CI; the separate god-file ratchet fails only on growth or unbaselined new oversized files.
- `npm run modularity:check` is the actionable gate: it runs the same ratchet used by CI, while `modularity:report` remains the debt inventory.
- Largest current files: `useServerVoiceSession.ts` (3308), `ChannelPanelList.vue` (3197), `VcActivityStage.vue` (3159), `ServerSettingsRolesSection.vue` (2735), `ChatInput.vue` (2713), `AppLayoutChatHeader.vue` (2476), `AppLayout.vue` (2332), `useAppLayoutDmCalls.ts` (2159), `DMPanel.vue` (2062), `MessageList.vue` (1977), …

### 1.2 LOC by area (`cloc` on `clients/web/src`, excluding `json` / `md` / `lock`)

| Area                      |                          Files (cloc) |                                                       Code lines (approx.) |
| ------------------------- | ------------------------------------: | -------------------------------------------------------------------------: |
| `src/features/`           |                                   482 |                                                **57,414** (incl. SASS/CSS) |
| `src/composables/`        |                                   102 |                                                                 **14,828** |
| `src/services/`           |                                   210 |                                                                 **20,740** |
| `src/utils/`              |                                   136 |                                                                  **8,920** |
| `src/api/`                |                                    37 |                                                                  **5,893** |
| `src/stores/`             |                                    20 |                                                                  **3,208** |
| `src/components/`         | 15 counted as TS+SASS by cloc split\* |                                                          see full-tree row |
| **All `clients/web/src`** |                                  1072 | **122,009** (TS+SASS+CSS; many `.vue` script/style split across languages) |

\*`cloc` classifies `.vue` bodies across languages; the **full-tree** total is the authoritative aggregate for `clients/web/src`.

### 1.3 `lint:perf` (`ESLINT_PERF_STRICT=1`)

- **543** problems reported: **138 errors**, **405 warnings** (includes strict TS rules, not only perf rules).
- **Perf-specific `no-restricted-syntax`:** **113** `.sort()` warnings, **24** deep `watch` warnings (counts from eslint output text scan).
- Interpretation: many `.sort()` hits are **acceptable** for small arrays (settings lists, one-off sorts); use this as a **triage list** for hot paths (message lists, explore, member lists), not a blanket refactor mandate.

---

## 2) Bundle composition (`ANALYZE=1`, `npm run build:no-typecheck`)

Build produced `clients/web/dist/bundle-stats.html` and typical chunk sizes (Rollup minified + gzip from build log):

| Chunk / asset              | Minified (approx.) | Gzip (approx.) | Class                         |
| -------------------------- | -----------------: | -------------: | ----------------------------- |
| `voice-krisp-*.js`         |          ~5,912 kB |      ~1,939 kB | **Vendor WASM / voice**       |
| `AppLayout-*.js`           |          ~3,403 kB |        ~964 kB | **App shell / feature graph** |
| `voice-livekit-*.js`       |            ~493 kB |        ~128 kB | Vendor                        |
| `index-*.js` (entry)       |            ~301 kB |         ~90 kB | Entry + boot                  |
| `ServerSettingsModal-*.js` |            ~277 kB |         ~74 kB | App (lazy modal)              |
| `emoji-json-*.js`          |            ~276 kB |         ~31 kB | Data / emoji                  |
| `SettingsModal-*.js`       |            ~202 kB |         ~57 kB | App (lazy modal)              |
| `vue-vendor-*.js`          |             ~86 kB |         ~34 kB | Vendor                        |
| `asset-registry-*.js`      |             ~53 kB |          ~9 kB | App icons registry            |
| `markdown-*.js`            |             ~45 kB |         ~14 kB | Vendor                        |
| `realtime-vendor-*.js`     |             ~43 kB |         ~13 kB | Vendor                        |

**Conclusion (A + B):** “Bloat” in bytes is **not** primarily TypeScript verbosity; it is **Krisp + LiveKit**, then the **monolithic AppLayout bundle**. Shrinking **gzip of `AppLayout`** matters more than deleting unused exports unless those exports pull heavy deps into that chunk.

---

## 3) Module graph / coupling

**Tooling:** `madge` failed on mixed Vue/TS parsing in this tree. **`dpdm`** from `src/features/layout/composables/useAppLayoutController.ts` succeeded (**509** modules).

### 3.1 Circular dependencies (dpdm)

1. **`src/api/authClient.ts` ↔ `src/stores/authSession.ts`** — **resolved (2026-05-14):** `authClient` now calls [`src/api/authSessionBridge.ts`](../../clients/web/src/api/authSessionBridge.ts); [`src/main.ts`](../../clients/web/src/main.ts) registers real handlers after `app.use(pinia)`; Vitest uses [`src/test/vitestSetup.ts`](../../clients/web/src/test/vitestSetup.ts) no-op handlers.

2. **`src/composables/useEmojiData.ts` ↔ `src/composables/useEmojiSearchIndex.ts`** — **resolved (2026-05-14):** search index cache + invalidation live in [`emojiSearchIndexState.ts`](../../clients/web/src/features/chat/emoji/emojiSearchIndexState.ts); shared shapes in [`emojiTypes.ts`](../../clients/web/src/features/chat/emoji/emojiTypes.ts).

### 3.2 Import hubs (manual `grep` `files_with_matches`)

- **`@/features/auth/authSession`:** **78** files — global session fan-in.
- **`@/api/authClient`:** **41** files — API + cookie/session concerns spread wide.
- **`@/features/layout/echoWorkspace/useEchoWorkspace`:** **28** files — workspace orchestration surface.

**Conclusion (C):** Coupling is **star-shaped** around session + workspace + layout controller. Refactors should assume **high blast radius** for those three.

---

## 4) Duplication (`jscpd`, `--min-lines 15 --min-tokens 80`)

- **140** clones; **~2.18%** duplicated lines (low globally).
- **Tests** account for many clones (acceptable).
- **Production-relevant** clusters to review:
  - **`useAppLayoutCallVoiceBridge.ts`** vs **`useAppLayoutShellVoice.ts`** — duplicated voice-bridge snippet.
  - **`SettingsFormattingGuide.vue`** vs **`SettingsLegal.vue`** — large shared markup block (~125 lines): candidate for shared subcomponent or markdown partial.
  - **`CompactDualPaneShell.vue`** vs **`CompactTriPaneShell.vue`** — structural duplication; consider shared layout primitive.
  - **Internal** duplication in **`AppLayoutVoiceSection.vue`**, **`AppLayoutDmSection.vue`**, **`ServerRailCenterColumn.vue`** — extract repeated sub-sections when touching those files.

**Parallel modules (maintainability):** both `src/features/chat/domain/messageSearchCore.ts` and `src/services/orchestration/messageSearchCore.ts` (and viewModel variant) exist — **Knip** flags some as unused; verify **which** is authoritative to avoid drift.

---

## 5) Dependency hygiene (`knip` + manual verification)

### 5.1 Unused dependencies (high confidence)

| Package                             | Evidence                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Previously unused frontend packages | Resolved: neither `vue-router` nor `@tiptap/extension-character-count` is present in `clients/web/package.json` or the lockfile. |

### 5.2 Context-specific / false “unused”

| Package | Notes |
| ------- | ----- |

| `-apps/*` removed with Tauri shell.
| **Knip “unused devDependencies”** (`eslint`, `sass`, `vue-tsc`, …) | **False positives** — used from npm scripts / root tooling, not from static `import` graph. |
| **Knip “unused files”** (`public/*`, `*.scss`, `vite-shims/*`, dynamic-only Vue) | **Dynamic imports**, **side-effect styles**, and **Vite config** references are invisible to default Knip. Do **not** bulk-delete from Knip alone. |

---

## 6) Ranked findings (top tier)

Use this as the prioritized backlog; each row follows the agreed template.

| #   | Axis | Finding                                                                                   | Evidence                               | User impact                           | Confidence | Recommended action                                                                                                                                                | Risk                                                  |
| --- | ---- | ----------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | A/B  | **`AppLayout` JS chunk ~964 kB gzip** dominates perceived load after shell.               | `dist/assets/AppLayout-*.js` build log | Slow post-login / layout interactive  | High       | Trace chunk with `ANALYZE=1` treemap; split **data** loading (emoji index, heavy modals) from **controller** wiring; avoid new static imports in `AppLayout.vue`. | High — chunk cycle risk per `vite.config.ts` comments |
| 2   | A    | **Krisp** ~2 MB gzip is inherent to noise cancellation.                                   | `voice-krisp-*.js`                     | Memory + download                     | High       | Treat as **product cost**; optional “download on first voice join” if product allows.                                                                             | Product / UX                                          |
| 3   | C    | **91 files > 700 lines**; the strict report remains a deliberate debt inventory.          | `modularity:report` + god-file ratchet | Bugs, review time, merge conflicts    | High       | Pick **2–3** worst offenders per quarter; avoid drive-by edits.                                                                                                   | Medium                                                |
| 4   | C    | Existing large files can drift without visibility if contributors skip the report.        | `god-file:check` only gates growth     | New maintainability debt              | High       | Keep the report in CI and require a reviewed baseline change for intentional growth.                                                                              | Low                                                   |
| 5   | C    | **Session store 78 importers**; **authClient 41**.                                        | `grep -rl` hub counts                  | Every auth change ripples wide        | High       | Stabilize small **read-only selectors** / facades for UI leaves.                                                                                                  | Medium                                                |
| 6   | C    | **Cycles:** `authClient` ↔ `authSession`; emoji composables cycle.                        | `dpdm`                                 | Subtle init bugs                      | High       | Break cycles with interfaces / lazy getters.                                                                                                                      | Medium                                                |
| 7   | D    | **SettingsFormattingGuide** vs **SettingsLegal** large clone.                             | `jscpd`                                | Drift between legal vs help UI        | Medium     | Extract shared **markdown doc renderer** snippet.                                                                                                                 | Low                                                   |
| 8   | D    | **Voice bridge** duplication (`useAppLayoutCallVoiceBridge` vs `useAppLayoutShellVoice`). | `jscpd`                                | Voice regressions if one path updated | Medium     | Extract shared helper for shared lines only.                                                                                                                      | High (voice)                                          |
| 9   | E    | Previously unused frontend dependencies.                                                  | Current workspace manifests + lockfile | Install clarity and audit surface     | High       | Resolved; keep dependency cleanup covered by periodic manifest/import checks.                                                                                     | Low                                                   |

### Second-tier watchlist

- **`lint:perf` `.sort()` hits** in `ExploreView`, `MemberList`, `FriendsView`, etc.: profile before rewriting.
- **`messageSearchCore` parallel paths** (`features/chat` vs `services/orchestration`): consolidate or delete dead file.
- **Knip unused exports (216):** mostly **library-style API surfaces**; treat as **documentation of public API**, not deletions, unless coupled to dead features.
- **Runtime validation:** pair this audit with **Chrome Performance** on cold load + first channel open + emoji picker + voice join to validate hypotheses #1 and #8.

---

## 7) How to reproduce

```bash
# Modularization
npm run modularity:report

# Perf lint
npm run lint:perf -w web

# LOC (example)
npx cloc@2.00 clients/web/src --exclude-dir=node_modules,dist --exclude-ext=json,md,lock

# Bundle treemap
cd frontend && ANALYZE=1 npm run build:no-typecheck
# open clients/web/dist/bundle-stats.html

# Cycles (from layout controller graph)
cd frontend && npx dpdm@3 --no-tree src/features/layout/composables/useAppLayoutController.ts

# Duplication
cd frontend && npx jscpd@4 src --min-lines 15 --min-tokens 80

# Dependency hygiene (noisy — interpret manually)
cd frontend && npx knip@5 --include files,dependencies,exports
```

---

## 8) Out of scope (explicit)

- **Marketing site**, **backend**, **bot** workspaces.
- **Legal / compliance** review of third-party licenses (only size impact noted here).
- **Automatic deletion** of Knip-reported files without dynamic-import and build verification.
