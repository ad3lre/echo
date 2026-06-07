# Echo Code Charter & Violations Tracker

A coding charter for Echo derived from the **Linux kernel coding style**
(`Documentation/process/coding-style.rst`,
<https://www.kernel.org/doc/html/latest/process/coding-style.html>), adapted to a
TypeScript / Vue / Node (Fastify + Socket.IO) codebase.

Echo already machine-enforces formatting via Prettier (`printWidth: 80`,
`tabWidth: 2`, `semi`, `singleQuote`) and ESLint. So this charter deliberately
**skips the kernel chapters Prettier/ESLint already enforce** (braces, spacing,
indent width) and keeps the **semantic** rules that tooling does not catch:
module/function size, nesting depth, naming, typing discipline, dead code, magic
numbers, logging, and process safety.

- **Scanned scope:** `frontend/src`, `backend/src`, `bot/src`, `shared`,
  `voice-sidecar/src` — excluding `node_modules`, `dist`, and test files
  (`*.test.*`, `*.integration.*`, `__tests__/`, `tests/`).
- **Size:** ~476k LOC across ~2,540 source files.
- **Status legend:** `OPEN` (violation to fix) · `ACCEPTED` (justified / domain
  term / tooling-suppressed with reason) · `WONTFIX` (acknowledged, not worth
  changing).

---

## 1. Kernel chapter → Echo relevance

| #   | Kernel chapter                                                            | Echo disposition                                                                     |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Indentation (≤3 nesting levels, no multi-statement lines, no trailing ws) | **Adopted** → C1 (nesting). Width/trailing-ws auto via Prettier.                     |
| 2   | Breaking long lines (≤80 cols)                                            | **Adopted** → C2. Code auto-wrapped by Prettier; long strings/comments/URLs are not. |
| 3   | Braces & spaces                                                           | **Auto-enforced** (Prettier). Not tracked.                                           |
| 4   | Naming (descriptive globals, no Hungarian, inclusive terms)               | **Adopted** → C5.                                                                    |
| 5   | Typedefs (discouraged in C)                                               | **Adapted** into C9 (typing discipline).                                             |
| 6   | Functions (1–2 screens, ≤5–10 locals)                                     | **Adopted** → C3 (function length) + C4 (module size).                               |
| 7   | Centralized exiting / cleanup                                             | **Adopted** → C8.                                                                    |
| 8   | Commenting (why not how, no boilerplate)                                  | **Adopted** → C7.                                                                    |
| 9   | Editor config (Emacs)                                                     | **N/A** (Prettier/EditorConfig).                                                     |
| 10  | Kconfig                                                                   | **N/A**.                                                                             |
| 11  | Data structures / reference counting                                      | **N/A** (GC language).                                                               |
| 12  | Macros, enums, magic numbers                                              | **Adapted** → C6 (named constants/enums; no magic numbers).                          |
| 13  | Printing kernel messages                                                  | **Adapted** → C12 (logging discipline; grammar in user strings).                     |
| 14  | Allocating memory (kmalloc)                                               | **N/A** (GC language).                                                               |
| 15  | The inline disease                                                        | **N/A** (no manual inlining).                                                        |
| 16  | Function return values & names                                            | **Adapted** → C5 (predicate names `is/has/should`; consistent returns).              |
| 17  | Using bool                                                                | **Auto/trivial** (TS `boolean`, `true`/`false`). Folded into C5 naming.              |
| 18  | Don't re-invent the macros                                                | **Adapted** → C11 (reuse shared utils; no duplication).                              |
| 19  | Editor modelines / cruft                                                  | **Adopted** → C7 (no editor cruft / dead code).                                      |
| 20  | Inline assembly                                                           | **N/A**.                                                                             |
| 21  | Conditional compilation (`#ifdef`)                                        | **Adapted** → C10 note (centralize env/feature flags; no preprocessor in TS).        |
| 22  | Don't crash the kernel (BUG/panic)                                        | **Adapted** → C10 (don't crash the process; throw only for the unexpected).          |

---

## 2. The Charter (adopted rules)

| ID      | Rule                               | Echo threshold                                                                                                                                         | Enforcement            |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| **C1**  | Shallow nesting                    | ≤4 indent levels in a function body; hard-flag ≥8 (≥16 spaces)                                                                                         | Manual                 |
| **C2**  | Short lines                        | ≤80 cols (Prettier); hard-flag >100 (strings/comments/URLs)                                                                                            | Prettier + manual      |
| **C3**  | Short functions                    | A function fits ~1–2 screens; flag >80 lines, hard-flag ≥120                                                                                           | Manual                 |
| **C4**  | Focused modules                    | A file does one thing; flag >400 lines, hard-flag >1500                                                                                                | Manual                 |
| **C5**  | Clear & inclusive naming           | Descriptive exported names; predicates `is/has/should`; no `blacklist`/`whitelist`/`master`/`slave` (use `allowlist`/`denylist`/`primary`/`secondary`) | Manual + grep          |
| **C6**  | Named constants, not magic numbers | UPPER_SNAKE consts / enums for timeouts, sizes, limits                                                                                                 | Manual                 |
| **C7**  | Comment _why_; no dead code        | No commented-out code, no editor modelines, no stray `TODO`/`FIXME` without a tracked issue                                                            | grep                   |
| **C8**  | Centralized cleanup                | One cleanup path (`try/finally`, `onScopeDispose`) over duplicated teardown at each early return                                                       | Manual                 |
| **C9**  | Strong typing                      | Avoid `any` / `as any` / `@ts-ignore`; lean on the type system                                                                                         | ESLint (`warn`) + grep |
| **C10** | Don't crash the process            | No `process.exit()` outside entrypoints/CLI; throw only for the unexpected; fail closed gracefully                                                     | grep + manual          |
| **C11** | Reuse over reinvention             | Use existing `shared/` and `utils/` helpers; no copy-paste                                                                                             | Manual                 |
| **C12** | Disciplined logging                | Structured diagnostics over raw `console.*` in runtime code; correct grammar in user-facing strings                                                    | grep                   |

---

## 3. Violations summary

| Rule                            | Findings                                                      | Dominant severity       | Notes                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| C1 nesting (≥8 levels)          | **940 lines** (.ts)                                           | OPEN                    | Concentrated in the same monster modules as C3/C4.                                                                         |
| C2 lines >100 cols              | **3,625 lines**                                               | OPEN (mostly low)       | Mostly long string literals / table defs / comments.                                                                       |
| C3 functions ≥120 lines         | **208 blocks**                                                | OPEN                    | Many are whole composable `useX()` setups.                                                                                 |
| C4 files >400 lines             | **254 files** (30 over 1500)                                  | OPEN                    | Top: `useAppLayoutController.ts` 4,684.                                                                                    |
| C5 terminology                  | **29 hits** (4 real `whitelist`; rest HLS/audio domain terms) | mixed                   | No `master/slave` pairs found.                                                                                             |
| C6 magic numbers                | **8 extracted**, ~12 deferred                                 | RESOLVED (tuning knobs) | Self-evident one-shot UI delays left as WONTFIX.                                                                           |
| C7 dead code / TODO / modelines | **1 TODO, 1 commented-line, 0 modelines**                     | low                     | Codebase is very clean here.                                                                                               |
| C8 centralized cleanup          | qualitative                                                   | review                  | Spot-check the long-function offenders.                                                                                    |
| C9 explicit `any`               | **7** (ACCEPTED)                                              | RESOLVED                | All actionable `any` typed; 7 forwarding-seam `any` kept ACCEPTED w/ eslint-disable. Plus 2 documented `@ts-expect-error`. |
| C10 `process.exit` (non-entry)  | **10** (9 in `config.ts` fail-fast)                           | ACCEPTED (mostly)       | Boot-time config validation.                                                                                               |
| C11 reuse / duplication         | qualitative                                                   | review                  | `numberParsing` extraction is a recent example fix.                                                                        |
| C12 `console.*` runtime         | **221** (mostly scripts/CLI)                                  | mixed                   | App-runtime ones are the concern.                                                                                          |

---

## 4. Violations — enumerated

> High-volume rules (C1, C2, C9, C12) are catalogued by **top offenders + a
> reproduction command** rather than listing every individual line; the command
> regenerates the exhaustive set on demand. Structural rules (C3, C4) and the
> small categories (C5, C7, C10) are enumerated individually.

### C4 — Files over 1500 lines (hard violations)

> Reproduce all `>400`: `find frontend/src backend/src bot/src shared voice-sidecar/src -type f \( -name '*.ts' -o -name '*.vue' \) | grep -vE 'node_modules|/dist/|__tests__|\.test\.|\.integration\.|/tests/' | xargs wc -l | awk '$1>400' | sort -rn`
> Buckets: **30** files >1500 · **54** files 801–1500 · **170** files 401–800.

| ID     | Lines | File                                                                              | Status                                                                                                     |
| ------ | ----- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| C4-001 | 4684  | `frontend/src/features/layout/composables/useAppLayoutController.ts`              | OPEN                                                                                                       |
| C4-002 | 3586  | `frontend/src/components/AppLayout.vue`                                           | OPEN                                                                                                       |
| C4-003 | 3502  | `frontend/src/composables/useLiveKitVoiceRoom.ts`                                 | OPEN                                                                                                       |
| C4-004 | 3440  | `frontend/src/features/voice/components/VcActivityStage.vue`                      | OPEN                                                                                                       |
| C4-005 | 3356  | `frontend/src/features/voice/components/VcHangmanGame.vue`                        | OPEN                                                                                                       |
| C4-006 | 2883  | `frontend/src/features/channel-panel/components/ChannelPanelList.vue`             | OPEN                                                                                                       |
| C4-007 | 2777  | `frontend/src/components/chat/MessageList.vue`                                    | OPEN                                                                                                       |
| C4-008 | 2758  | `backend/src/db/echoTables.ts`                                                    | OPEN                                                                                                       |
| C4-009 | 2719  | `backend/src/domain/echoMessagesDal.ts`                                           | OPEN                                                                                                       |
| C4-010 | 2707  | `frontend/src/features/server-settings/components/ServerSettingsRolesSection.vue` | OPEN                                                                                                       |
| C4-011 | 2483  | `backend/src/services/discordImport.ts`                                           | PARTIAL (pure helpers → `discordImportJson.ts`, `discordImportPermissions.ts`; main still oversized)       |
| C4-012 | 2583  | `frontend/src/components/MoreServersPanel.vue`                                    | OPEN                                                                                                       |
| C4-013 | 2573  | `frontend/src/features/layout/composables/useServerVoiceSession.ts`               | OPEN                                                                                                       |
| C4-014 | 2417  | `frontend/src/features/layout/components/AppLayoutChatHeader.vue`                 | OPEN                                                                                                       |
| C4-015 | 2341  | `frontend/src/components/chat/ChatInput.vue`                                      | OPEN                                                                                                       |
| C4-016 | 2139  | `frontend/src/features/layout/composables/useAppLayoutDmCalls.ts`                 | OPEN                                                                                                       |
| C4-017 | 1945  | `backend/src/config.ts`                                                           | OPEN                                                                                                       |
| C4-018 | 1928  | `frontend/src/components/DMPanel.vue`                                             | OPEN                                                                                                       |
| C4-019 | 1873  | `backend/src/auth/store/postgres/PostgresAuthStore.ts`                            | OPEN                                                                                                       |
| C4-020 | 1861  | `frontend/src/components/ChannelSettingsModal.vue`                                | OPEN                                                                                                       |
| C4-021 | 1848  | `frontend/src/features/auth/MobileAuthExperience.vue`                             | OPEN                                                                                                       |
| C4-022 | 1787  | `frontend/src/components/LoginRegisterModal.vue`                                  | OPEN                                                                                                       |
| C4-023 | 1776  | `backend/src/domain/echoStore/categoriesWorkspace.ts`                             | OPEN                                                                                                       |
| C4-024 | 11    | `frontend/src/audio/voiceEchoLiveKitData.ts`                                      | RESOLVED (barrel; codecs split into `voiceData/*` by activity)                                             |
| C4-025 | 1480  | `frontend/src/api/authClient.ts`                                                  | PARTIAL (core types/errors/transport helpers → `authClientCore.ts`; below hard threshold, still oversized) |
| C4-026 | 1233  | `frontend/src/components/CallView.vue`                                            | RESOLVED (state/media/menu logic → `useCallViewState.ts`; below hard threshold)                            |
| C4-027 | 1683  | `frontend/src/features/settings/components/SettingsAccount.vue`                   | OPEN                                                                                                       |
| C4-028 | 1653  | `frontend/src/features/layout/components/AppLayoutLeftChrome.vue`                 | OPEN                                                                                                       |
| C4-029 | 1624  | `frontend/src/components/chat/MessageBubble.vue`                                  | OPEN                                                                                                       |
| C4-030 | 1561  | `frontend/src/features/layout/components/WelcomeBackExploreGate.vue`              | OPEN                                                                                                       |

> Note: `useAppLayoutController.ts` (C4-001) is the subject of an in-flight
> move-only decomposition effort — already recognized as the top offender.

### C3 — Functions/blocks ≥120 lines (top 25 of 208)

> Heuristic (brace-depth) scan; whole-composable `useX()` setups and large SQL
> table/object literals inflate some counts — verify before splitting. Reproduce
> with the `fnscan` heuristic (see repo history / `/tmp/fnscan.mjs`).

| ID     | Lines | Location                                                                          | Status                    |
| ------ | ----- | --------------------------------------------------------------------------------- | ------------------------- |
| C3-001 | 4417  | `frontend/src/features/layout/composables/useAppLayoutController.ts:268`          | OPEN                      |
| C3-002 | 2409  | `frontend/src/features/layout/composables/useServerVoiceSession.ts:165`           | OPEN                      |
| C3-003 | 2046  | `frontend/src/features/layout/composables/useAppLayoutDmCalls.ts:94`              | OPEN                      |
| C3-004 | 1509  | `backend/src/db/echoTables.ts:17`                                                 | OPEN (likely DDL literal) |
| C3-005 | 1020  | `frontend/src/features/layout/composables/useAddServerFlow.ts:82`                 | OPEN                      |
| C3-006 | 970   | `backend/src/db/echoTables.ts:1724`                                               | OPEN (likely DDL literal) |
| C3-007 | 902   | `frontend/src/features/layout/composables/useGuildChannelModals.ts:134`           | OPEN                      |
| C3-008 | 888   | `frontend/src/features/server-settings/composables/useServerSettingsEmoji.ts:318` | OPEN                      |
| C3-009 | 735   | `frontend/src/features/layout/composables/useAppLayoutLayoutChrome.ts:47`         | OPEN                      |
| C3-010 | 722   | `frontend/src/features/server-settings/composables/useServerSettingsRoles.ts:38`  | OPEN                      |
| C3-011 | 701   | `backend/src/api/routes/auth/me.ts:63`                                            | OPEN                      |
| C3-012 | 684   | `frontend/src/features/layout/composables/useAppLayoutController.expose.ts:3`     | OPEN                      |
| C3-013 | 663   | `frontend/src/features/layout/composables/useAppLayoutShellVoice.ts:77`           | OPEN                      |
| C3-014 | 625   | `backend/src/sockets/chatMessageHandler.ts:79`                                    | OPEN                      |
| C3-015 | 624   | `frontend/src/features/layout/composables/useAppLayoutProfilesDomain.ts:65`       | OPEN                      |
| C3-016 | 606   | `frontend/src/features/layout/composables/useGuildModeration.ts:24`               | OPEN                      |
| C3-017 | 530   | `frontend/src/composables/useLiveKitVoiceRoom.ts:1996`                            | OPEN                      |
| C3-018 | 520   | `frontend/src/main.ts:147`                                                        | OPEN                      |
| C3-019 | 512   | `frontend/src/features/voice/skriggles/composables/useSkrigglesCanvas.ts:53`      | OPEN                      |
| C3-020 | 500   | `frontend/src/features/voice/wordline/useWordlineGame.ts:147`                     | OPEN                      |
| C3-021 | 462   | `bot/src/uptimeMonitor.ts:45`                                                     | OPEN                      |
| C3-022 | 460   | `frontend/src/features/layout/composables/useUrlNavigationSync.ts:89`             | OPEN                      |
| C3-023 | 448   | `frontend/src/services/orchestration/voice.ts:81`                                 | OPEN                      |
| C3-024 | 446   | `frontend/src/features/layout/composables/useEchoGuildRoleUi.ts:20`               | OPEN                      |
| C3-025 | 415   | `frontend/src/composables/useLayout.ts:37`                                        | OPEN                      |

### C1 — Deep nesting (≥8 indent levels)

> **940** `.ts` lines exceed 8 levels (≥16 leading spaces). Reproduce:
> `find frontend/src backend/src bot/src shared voice-sidecar/src -name '*.ts' | grep -vE 'node_modules|/dist/|__tests__|\.test\.|\.integration\.|/tests/' | xargs grep -nE '^                {1,}[^ ]'`

| ID     | Scope                                                                                                                                | Status |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| C1-001 | 940 lines ≥8 levels — overwhelmingly inside the C4 monster modules (layout composables, voice, DAL). Resolve alongside C3/C4 splits. | OPEN   |

### C2 — Lines over 100 columns (top offenders of 3,625)

> Reproduce per file: `... | xargs awk 'length>100'`. Most are long string
> literals, SQL/DDL, config tables, and doc comments Prettier cannot wrap.

| ID     | Count | File                                                                                                                                    | Status             |
| ------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| C2-001 | 75    | `backend/src/db/echoTables.ts`                                                                                                          | OPEN (DDL strings) |
| C2-002 | 73    | `backend/src/config.ts`                                                                                                                 | OPEN               |
| C2-003 | 45    | `frontend/src/components/FriendsView.vue`                                                                                               | OPEN               |
| C2-004 | 42    | `frontend/src/components/ExploreView.vue`                                                                                               | OPEN               |
| C2-005 | 37    | `frontend/src/components/chat/MessageList.vue`                                                                                          | OPEN               |
| C2-006 | 36    | `frontend/src/components/AddServerModal.vue`                                                                                            | OPEN               |
| C2-007 | 32    | `frontend/src/components/ReportModal.vue`                                                                                               | OPEN               |
| C2-008 | 30    | `frontend/src/components/ServerSettingsModal.vue`                                                                                       | OPEN               |
| C2-009 | 29    | `frontend/src/components/chat/PendingMediaPreview.vue` / `DMCallView.vue` / `ChannelSettingsModal.vue` / `backend/.../discordImport.ts` | OPEN               |
| C2-010 | 28    | `frontend/src/components/DMPanel.vue`                                                                                                   | OPEN               |

### C9 — Explicit `any` (top offenders of 119)

> Reproduce: `... | xargs grep -nE ':[[:space:]]*any\b|as any\b|<any>|\bany\[\]'`.
> ESLint already flags these as `warn` under `lintStrict`.

| ID     | Count | File                                                                                                                                                                                                                                                                   | Status   |
| ------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| C9-001 | 0     | `frontend/src/components/AppLayout.vue`                                                                                                                                                                                                                                | RESOLVED |
| C9-002 | 0     | `frontend/src/features/layout/composables/useAppLayoutProfilesDomain.ts`                                                                                                                                                                                               | RESOLVED |
| C9-006 | 0     | `frontend/src/composables/useLiveKitVoiceRoom.ts`                                                                                                                                                                                                                      | RESOLVED |
| C9-012 | 0     | `frontend/src/features/layout/chatSwitchPerfTrace.ts`                                                                                                                                                                                                                  | RESOLVED |
| C9-013 | 0     | `frontend/src/features/chat/components/ChatInputComposerBar.vue`                                                                                                                                                                                                       | RESOLVED |
| C9-014 | 0     | `frontend/src/features/channel-panel/components/ChannelPanelList.vue`                                                                                                                                                                                                  | RESOLVED |
| C9-015 | 0     | `frontend/src/components/CallView.vue`                                                                                                                                                                                                                                 | RESOLVED |
| C9-016 | 0     | `frontend/src/api/echo/channels.ts`                                                                                                                                                                                                                                    | RESOLVED |
| C9-017 | 0     | `backend/src/auth/store/postgres/PostgresAuthStore.ts`                                                                                                                                                                                                                 | RESOLVED |
| C9-003 | 0     | `frontend/src/features/server-settings/components/ServerSettingsEmojiSection.vue`                                                                                                                                                                                      | RESOLVED |
| C9-004 | 0     | `frontend/src/features/layout/components/AppLayoutLeftChrome.vue`                                                                                                                                                                                                      | RESOLVED |
| C9-005 | 0     | `frontend/src/services/orchestration/appLayout.ts`                                                                                                                                                                                                                     | RESOLVED |
| C9-007 | 0     | `frontend/src/services/orchestration/serverSettings.ts`                                                                                                                                                                                                                | RESOLVED |
| C9-008 | 0     | `frontend/src/features/settings/composables/useSettingsAccountSecurity.ts`                                                                                                                                                                                             | RESOLVED |
| C9-009 | 0     | `frontend/src/features/layout/components/AppLayoutChatHeader.vue`                                                                                                                                                                                                      | RESOLVED |
| C9-010 | 0     | `frontend/src/features/forums/domain/forumPostChannel.ts`                                                                                                                                                                                                              | RESOLVED |
| C9-011 | 2     | `@ts-expect-error` — `backend/src/services/linkUnfurl/linkUnfurl.ts:237`, `linkUnfurlFetch.ts:227` (Node 18+ undici dispatcher typing gap)                                                                                                                             | ACCEPTED |
| C9-018 | 0     | Long-tail sweep (~40 files): DB row mappers → `Record<string, unknown>`; `catch (err: any)` → `unknown` + `instanceof Error`/`pgErrorCode`; stale casts dropped; props/composables typed (StreamVideoTileTrack, ManagedRole, ChannelSummary, YouTube IFrame API, etc.) | RESOLVED |

> **C9 remainder (7 ACCEPTED).** Two layout prop-forwarding shims
> (`AppLayoutChatSurface.vue`, `AppLayoutModals.vue`) return a merged
> inject+props bag as `any` so child components keep their own prop contracts;
> two channel computeds bridge the slim search-panel shape to the wider voice/DM
> child summaries; three context-menu `menuRef` props receive a parent ref that
> Vue unwraps to its element when forwarded to a child `:ref`. Each is annotated
> with an `eslint-disable-next-line @typescript-eslint/no-explicit-any` and a
> reason; tightening them would break the child contracts or all call sites.

### C12 — `console.*` in runtime code (221 total)

> Breakdown: `console.log` 90 · `console.warn` 69 · `console.error` 61 ·
> `console.debug` 1. The bulk are in CLI/maintenance contexts where stdout _is_
> the interface — those are ACCEPTED; app-runtime usages are the concern.

| ID      | Count | File                                                                                           | Status                       |
| ------- | ----- | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| C12-001 | 22    | `bot/src/index.ts` (bot CLI output)                                                            | ACCEPTED                     |
| C12-002 | 9     | `bot/src/uptimeMonitor.ts`                                                                     | ACCEPTED                     |
| C12-003 | 8     | `backend/src/scripts/wipeAppDatabase.ts` (+ other `backend/src/scripts/*` maintenance scripts) | ACCEPTED                     |
| C12-004 | 11    | `frontend/src/platform/desktopDeepLink.ts`                                                     | OPEN (route via diagnostics) |
| C12-005 | 9     | `frontend/src/platform/desktopBridge.ts`                                                       | OPEN (route via diagnostics) |
| C12-006 | 6     | `frontend/src/components/chat/MessageList.vue`                                                 | OPEN (runtime component)     |

### C5 — Terminology

> `git grep -niE 'blacklist|whitelist|\bmaster\b|\bslave\b'`. **No `master/slave`
> pairs** exist. `master.m3u8` (HLS spec), "master volume/level" (audio), and
> "master secret" (scrypt KDF) are domain-standard terms → ACCEPTED. The genuine
> items are `whitelist` (prefer `allowlist`):

| ID     | Location                                                                                        | Status   |
| ------ | ----------------------------------------------------------------------------------------------- | -------- |
| C5-001 | `backend/src/domain/contentJsonValidation.ts` — "whitelist nodes" comment                       | RESOLVED |
| C5-002 | `backend/src/services/echoModerationOps.ts` — "Whitelist for `meta.deleteRecentMessagesHours`"  | RESOLVED |
| C5-003 | `backend/src/services/echoMessageEditDeleteOps.ts` — "positive whitelist value"                 | RESOLVED |
| C5-004 | `frontend/src/features/chat/editor/echoContentJsonForRender.ts` — "Mirrors server whitelist"    | RESOLVED |
| C5-005 | "master volume/level/switch" (audio UI) · `master.m3u8` (HLS) · "master secret" (KDF) — 25 hits | ACCEPTED |

### C6 — Magic numbers (timer literals)

21 `setTimeout`/`setInterval` sites used inline ≥3-digit literals. Reproduce:
`... xargs grep -nE 'set(Timeout|Interval)\([^,]*,\s*[0-9]{3,}\s*\)'`.

**Resolved** — extracted the genuine tuning knobs (poll cadences, retry/backoff,
related UX timings) into named `UPPER_SNAKE_MS` constants:

| ID     | Constant                                        | Site                                 | Status   |
| ------ | ----------------------------------------------- | ------------------------------------ | -------- |
| C6-001 | `DISCORD_BOT_BG_POLL_INTERVAL_MS` (5000)        | `useAppLayoutDiscordBotPoll.ts`      | RESOLVED |
| C6-002 | `YT_WATCH_PUBLISH_INTERVAL_MS` (2200)           | `useVcYoutubeWatchTogetherPlayer.ts` | RESOLVED |
| C6-003 | `STARTUP_KICKOFF_DELAY_MS` (5000)               | `utils/startupScheduler.ts`          | RESOLVED |
| C6-004 | `GUEST_WELCOME_PREFS_SCHEDULE_DELAY_MS` (700)   | `useAppLayoutGuestSession.ts`        | RESOLVED |
| C6-005 | `GUEST_WELCOME_PREFS_AFTER_NAME_DELAY_MS` (400) | `useAppLayoutGuestSession.ts`        | RESOLVED |
| C6-006 | `GUEST_WELCOME_PREFS_INITIAL_DELAY_MS` (1400)   | `useAppLayoutGuestSession.ts`        | RESOLVED |
| C6-007 | `COPY_FEEDBACK_RESET_MS` (2000, ×2 — DRY)       | `InviteUsersModal.vue`               | RESOLVED |
| C6-008 | `PAIRING_POLL_INTERVAL_MS` (1200)               | `services/e2ee/e2eePairing.ts`       | RESOLVED |

**Deferred (WONTFIX)** — the remaining ~12 are self-evident, single-use, one-shot
UI delays already clear from context (e.g. `setTimeout(() => copied = false, …)`,
countdown ticks, highlight removal, scroll-snap, gif cleanup). Naming these adds
indirection without clarity — extracting them would be the kind of pointless
abstraction the kernel style itself warns against. Sites: `useEchoSounds.ts:206`,
`useEmojiData.ts:160`, `uploadPendingMediaAsAttachments.ts:62`,
`WelcomeBackExploreGate.vue:93`, `VcSkrigglesWordPicker.vue:22`,
`DeployCountdownOverlay.vue:30`, `GifPopout.vue:366`, `MessageList.vue:1847,2444`,
`authClient.ts:351` & `nativeAuthToken.ts:154` (both already carry explanatory
comments).

### C7 — Dead code / TODO / modelines

| ID     | Location                                                                                              | Status |
| ------ | ----------------------------------------------------------------------------------------------------- | ------ |
| C7-001 | `shared/vcActivityCatalog.ts:6` — `TODO: set true to re-enable Echoed Names…`                         | OPEN   |
| C7-002 | Commented-out code: **1** heuristic hit total; editor modelines: **0** — category is otherwise clean. | n/a    |

### C10 — `process.exit` outside entrypoints

| ID      | Location                                                                                                                                                                 | Status   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| C10-001 | `backend/src/config.ts` ×9 (boot-time config validation, fail-fast) + `backend/src/observability/otel.ts:35` (SDK shutdown). All at startup/shutdown, not request paths. | ACCEPTED |

### C8 / C11 — Qualitative (no automated enumeration)

| ID      | Rule                   | Action                                                                                                       | Status |
| ------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| C8-001  | Centralized cleanup    | Audit the C3 long-function offenders for duplicated teardown across early returns.                           | REVIEW |
| C11-001 | Reuse over reinvention | Sample the C4 monster modules for copy-paste; the recent `shared/numberParsing` extraction is the model fix. | REVIEW |

---

## 5. CI enforcement (June 2026+)

Pre-**2026-06-01** source paths are listed in
`scripts/new-code-charter-grandfather.json` and are **exempt** from this gate.

All other paths under `frontend/src`, `backend/src`, `shared`, `bot/src`, and
`voice-sidecar/src` (excluding tests) are subject to:

| Mode        | When                                                                  | Rules                                                                                                                               |
| ----------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Strict**  | File is post-cutoff and **not** in `new-code-charter-enrollment.json` | Full charter thresholds: ≤400 lines/file, ≤80 lines/function, ≤12-space nesting, no `any`, no `console.log`, MVC layer guards, etc. |
| **Ratchet** | File is enrolled (June-era debt snapshot)                             | Metrics may **not worsen** (lines, longest function, nesting depth).                                                                |

Commands:

```bash
npm run charter:new-code:check          # CI / local
npm run charter:new-code:test           # unit tests for the checker
npm run charter:new-code:enrollment     # refresh enrolled ceilings after intentional bumps
```

Wired into: `echo-frontend-ci`, `echo-backend-ci`, `echo-format-ci`, `test:ci:guards`,
and `scripts/githooks/pre-commit` (`--staged`).

---

## 6. Categories checked and found clean

These kernel-derived checks returned (near-)zero — recorded so the charter shows
what was verified, not just what failed:

- **Inclusive terminology** — no `master/slave` pairs; only domain-standard terms.
- **`@ts-ignore` / `@ts-nocheck`** — 0 (only 2 documented `@ts-expect-error`).
- **Editor modelines / cruft** — 0.
- **Commented-out code** — ~1 line across 467k LOC.
- **`TODO`/`FIXME`/`HACK`/`XXX`** — 1.
- **`eslint-disable`** — 9, all with a trailing `-- reason` justification.

The dominant, actionable debt is **structural**: a cluster of very large modules
(C4) containing very long functions (C3) with deep nesting (C1) — primarily the
`features/layout` composables, voice components, and a few backend DAL/config
files. Attacking the C4 top-30 mechanically retires the bulk of C1 and C3.
