# Frontend LOC drivers memo (2026-05-14)

Companion to [`frontend-typescript-bloat-audit.md`](./frontend-typescript-bloat-audit.md): that document ties **gzip / chunks** to hotspots; this memo ties **raw line counts** under `frontend/src` to **maintainability** and a **safe reduction path**.

## Methodology

- **Inventory:** walk `frontend/src` for `.vue`, `.ts`, `.tsx`, `.js`, `.jsx` (skip `node_modules` / `dist`); **physical lines** = `split(/\r?\n/).length` per file.
- **Why not only `cloc`?** `cloc` splits `.vue` across languages and reports lower **“code”** totals (audit §1.2: ~**122k** code lines for all of `frontend/src`). Raw lines here are **~232.7k** across **1276** files—useful for “how big is the tree on disk,” not for bundle weight.
- **SFC split:** `@vue/compiler-sfc` block bodies (`descriptor.template`, `script` + `scriptSetup`, `styles[]`, `customBlocks[]`). Respects nested `<template #slot>` (naive regex on `</template>` is wrong for those files). Residual **other** ≈ SFC wrapper lines (typically 2–4).

## What drives LOC

| Bucket (prefix)             | Raw lines (approx.) | Note                                                                  |
| --------------------------- | ------------------: | --------------------------------------------------------------------- |
| `components/`               |              58,366 | App shell + chat + modals live here; overlaps `AppLayout` megamodule. |
| `features/layout/`          |              48,608 | Layout chrome, DM/call wiring, composables—largest **feature** slice. |
| `services/`                 |              23,187 | Domain + orchestration; wide surface mirrors server contracts.        |
| `composables/`              |              17,164 | Shared orchestration (voice, workspace, etc.).                        |
| `features/server-settings/` |              13,662 | Large settings sections (roles, structure).                           |
| `features/chat/`            |              10,760 | Chat UI + domain helpers.                                             |
| `utils/`                    |              10,758 | Cross-cutting helpers.                                                |
| `features/settings/`        |              10,392 | Account/settings modals.                                              |
| `features/voice/`           |               7,169 | VC surfaces + voice UI.                                               |
| `api/`                      |               6,537 | `authClient` and HTTP surface.                                        |

**Verdict:** LOC is **concentrated in layout + components + services**, not random sprawl. A handful of **superfiles** account for a disproportionate share of review burden.

## Top 25 files (physical lines + SFC split)

| Rank | Path                                                                     | Total |  Tpl | Script | Style | Tag              |                                              Removable LOC (band) | Risk                                                                                     |
| ---: | ------------------------------------------------------------------------ | ----: | ---: | -----: | ----: | ---------------- | ----------------------------------------------------------------: | ---------------------------------------------------------------------------------------- |
|    1 | `components/AppLayout.vue`                                               |  4488 |  879 |   3365 |   241 | Mixed            |       **Med** (extract subviews/composables along existing seams) | **High** (chunk graph / `manualChunks` in `vite.config.ts`—avoid widening cross-imports) |
|    2 | `features/layout/composables/useAppLayoutController.ts`                  |  3926 |    0 |   3926 |     0 | Justified + debt |                   **Med** (slice by responsibility; not “delete”) | **High** (hub orchestration)                                                             |
|    3 | `composables/useLiveKitVoiceRoom.ts`                                     |  2959 |    0 |   2959 |     0 | Justified        |                    **Low** (refactor for clarity, not vanity LOC) | **High** (voice correctness)                                                             |
|    4 | `features/voice/components/VcActivityStage.vue`                          |  2941 |  938 |    958 |  1042 | Justified        |                                                           **Low** | **High**                                                                                 |
|    5 | `components/chat/MessageList.vue`                                        |  2517 |  219 |   2290 |     5 | Mixed            | **Med** (template small; script-heavy list logic—extract helpers) | **High** (hot path)                                                                      |
|    6 | `features/channel-panel/components/ChannelPanelList.vue`                 |  2394 |  933 |   1000 |   458 | Mixed            |                             **Med** (presentational + list state) | **Med–high**                                                                             |
|    7 | `features/server-settings/components/ServerSettingsRolesSection.vue`     |  2340 | 1697 |    641 |     0 | Mixed            |                    **Med** (huge template—subcomponents / tables) | **Med** (RBAC UX)                                                                        |
|    8 | `features/layout/components/AppLayoutChatHeader.vue`                     |  2290 | 1266 |   1022 |     0 | Mixed            |                                                           **Med** | **Med**                                                                                  |
|    9 | `features/layout/composables/useAppLayoutDmCalls.ts`                     |  2143 |    0 |   2143 |     0 | Justified        |                                                       **Low–med** | **High**                                                                                 |
|   11 | `components/chat/ChatInput.vue`                                          |  1995 |  334 |   1160 |   498 | Mixed            |                                                           **Med** | **Med**                                                                                  |
|   12 | `components/DMPanel.vue`                                                 |  1772 |  810 |    698 |   261 | Mixed            |                                                           **Med** | **Med**                                                                                  |
|   13 | `components/CallView.vue`                                                |  1648 |  606 |    530 |   509 | Mixed            |                                                       **Low–med** | **High**                                                                                 |
|   14 | `components/LoginRegisterModal.vue`                                      |  1597 |  654 |    535 |   405 | Mixed            |                                                       **Low–med** | **Med**                                                                                  |
|   15 | `features/settings/components/SettingsAccount.vue`                       |  1539 | 1385 |    152 |     0 | Mixed            |                                    **Med** (template-heavy forms) | **Med**                                                                                  |
|   16 | `features/layout/components/WelcomeBackExploreGate.vue`                  |  1536 |  403 |    196 |   934 | Mixed            |                                  **Med** (large scoped **style**) | **Low–med**                                                                              |
|   17 | `api/authClient.ts`                                                      |  1505 |    0 |   1505 |     0 | Justified        |                                                           **Low** | **High** (session + API hub)                                                             |
|   18 | `features/layout/components/AppLayoutLeftChrome.vue`                     |  1484 |  581 |    901 |     0 | Mixed            |                                                           **Med** | **Med**                                                                                  |
|   19 | `components/DMCallView.vue`                                              |  1416 |  668 |    567 |   178 | Mixed            |                                                       **Low–med** | **High**                                                                                 |
|   20 | `components/ChannelSettingsModal.vue`                                    |  1357 |  618 |    536 |   200 | Mixed            |                                                       **Low–med** | **Med**                                                                                  |
|   21 | `components/chat/MessageBubble.vue`                                      |  1340 |  399 |    935 |     3 | Mixed            |                                                           **Med** | **Med**                                                                                  |
|   22 | `components/AddServerModal.vue`                                          |  1333 |  674 |    365 |   291 | Mixed            |                                                       **Low–med** | **Med**                                                                                  |
|   23 | `features/server-settings/components/ServerSettingsStructureSection.vue` |  1293 |  613 |    678 |     0 | Mixed            |                                                           **Med** | **Med**                                                                                  |
|   24 | `components/ExploreView.vue`                                             |  1264 |  555 |    395 |   310 | Mixed            |                                                       **Low–med** | **Med**                                                                                  |
|   25 | `features/layout/composables/useServerVoiceSession.ts`                   |  1220 |    0 |   1220 |     0 | Justified        |                                                           **Low** | **High**                                                                                 |

**Tag legend**

- **Justified:** product-critical or contract-heavy; shrinking lines is refactor/risk tradeoff, not delete-the-file.
- **Mixed:** real product surface plus **structural debt** (single-file orchestration, oversized template, or style-heavy presentation).
- **Bloat-prone:** unused modules, duplicate implementations, or parallel “hint” files—see knip triage below.

## Bloat vs justified (rubric)

| Class         | Signals                                                                                                                                                                                                               | LOC lever                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Bloat**     | No importers after `grep` + route audit; duplicate module next to canonical (`services/orchestration/*` vs stale `features/layout/composables/*` **re-export**); repeated markup (audit §4 clones); debug-only paths. | Delete, merge, or extract shared primitive.                                  |
| **Justified** | LiveKit/voice state machines, DM/call bridges, RBAC/settings, message list + realtime, API client mirroring backend, layout hub wiring.                                                                               | **Narrow public surfaces**, tests, **vertical slices**—not blanket deletion. |

**Guardrail:** do not treat **LOC down** as **gzip down** unless code is removed from **hot import paths** (see audit §2). Avoid refactors that **tighten** imports around `AppLayout` / shared chunks against the **circular chunk** constraints called out in `frontend/vite.config.ts`.

## Dead code and duplication (this pass)

### Knip (`npx knip@5`, cwd `frontend/`, 2026-05-14)

- Reported **70** “unused files” and noisy dependency hints (matches prior audit: treat as **hints**).
- **High-confidence false positives:** anything under `public/`, `vite-shims/**`, SCSS partials consumed only from Vue `<style lang="scss">`, and **barrel** files (`src/services/index.ts`) that knip does not see as entrypoints.
- **Triage pattern (verified sample):** `src/features/layout/composables/useAppLayoutEchoDmState.ts` is a **one-line re-export** to `@/services/orchestration/useAppLayoutEchoDmState`; production imports go **directly** to `services/orchestration`. Same pattern may apply to other knip-listed layout composables—**safe removal only after** confirming zero imports of the legacy path (including docs/tests).

### jscpd (`npx jscpd@4 src --min-lines 15 --min-tokens 80`, cwd `frontend/`)

- **~1.88%** duplicated lines (**3324** / **176377** lines in scan scope), **129** clones—**low globally**, aligned with audit §4 (~2.18% on a slightly different scope/count). ROI is **targeted** cluster fixes (e.g. compact pane shells, settings legal/formatting overlap), not repo-wide dedupe.

## Ordered 10-item LOC reduction backlog (ROI vs risk)

1. **Knip-driven unused file triage:** for each candidate, prove **no** dynamic `import()`, router string, SCSS `@use`, or Vite alias—then delete. Lowest risk when proof is mechanical.
2. **Remove dead compatibility re-exports** under `features/layout/composables/` that duplicate `services/orchestration/*` (update any straggler imports to canonical path).
3. **Extract from `useAppLayoutController.ts`:** one responsibility per PR (e.g. DM rail, explore gate, server voice) using existing composable seams—**med** LOC, **high** risk; keep imports from widening the `AppLayout` chunk fan-in.
4. **Split `AppLayout.vue`:** move self-contained regions into child components already lazy or colocated—favor **template + thin script** extractions first.
5. **`MessageList.vue` / `MessageBubble.vue`:** extract pure helpers + list subcomponents to shrink script blocks without changing behavior—**high** test value.
6. **`ChannelPanelList.vue` / `AppLayoutChatHeader.vue`:** template-heavy—subcomponents for repeated rows/menus; watch for style duplication.
7. **`ServerSettingsRolesSection.vue` / `ServerSettingsStructureSection.vue`:** table/section components; share primitives with other server-settings sections.
8. **Resolve audit §4 clone clusters** (`CompactDualPaneShell` vs `CompactTriPaneShell`, settings formatting/legal overlap, voice bridge overlap)—**med** risk, moderate LOC.
9. **Voice megamodules (`useLiveKitVoiceRoom.ts`, `VcActivityStage.vue`):** default stance **justified**—only refactors driven by bugs, tests, or product scope change.

## Reproducibility

```bash
# Full inventory JSON (buckets + every file) and SFC splits for top 25 (default)
node scripts/frontend-loc-inventory.mjs --all

# Larger ranked sample with compiler splits
node scripts/frontend-loc-inventory.mjs --top 50

# Knip (hints only)
cd frontend && npx knip@5

# jscpd (writes jscpd-report.json under the output directory)
cd frontend && npx jscpd@4 src --min-lines 15 --min-tokens 80 --reporters json --silent -o /tmp/jscpd-frontend
```

The **top-25** table matches `node scripts/frontend-loc-inventory.mjs` (default `--top 25`) on the revision used for this memo. The script resolves `@vue/compiler-sfc` via `frontend/package.json` (run `npm install` under `frontend/` first).
