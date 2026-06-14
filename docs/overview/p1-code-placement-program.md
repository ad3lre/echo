# P1 — Feature code placement program

**Status:** **P1 complete** — `components/` at **10** primitives (was 195); legacy allowlist **empty**  
**Owner:** Frontend architecture / charter  
**Prerequisite for:** P2 (layer manifest), P3 (`Result<T,E>`), P4 (naming)  
**Charter home after P1:** [code-placement.md](./code-placement.md) (single source of truth)

This document turns the abstract “consolidation + enforcement” program into an executable plan grounded in Echo’s **current tree and CI wiring** (June 2026).

---

## Why P1 first

A senior contributor’s first question is _“where does this `.vue` go?”_ Today the tree answers twice:

| Location                   | `.vue` count (Jun 2026) | Problem                                                                 |
| -------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `frontend/src/components/` | **162**                 | Feature UI, shell modals, chat (58 files), auth, DM, voice call chrome  |
| `frontend/src/features/`   | **172**                 | Same domains already started (`chat/`, `auth/`, `layout/`, `voice/`, …) |

`features/README.md` still says _“Existing `components/_` remain valid during migration”\* — leg 3 (clean tree) is explicitly open.

**P1 is done only when all three legs are green:**

1. **Exactly one written answer** — [code-placement.md](./code-placement.md)
2. **CI rejects every other answer** — `check-code-placement.mjs` in `test:ci:guards`
3. **Zero contradicting examples** — `components/` holds only the design-system allowlist; everything else lives under exactly one `features/<domain>/`

---

## Measured baseline (snapshot 2026-06-14)

```
frontend/src/components/     195 source files (.vue/.ts/.scss)
  ├─ chat/                    69
  ├─ member-profile/          10
  ├─ media/                    8
  ├─ auth/                     2
  ├─ e2ee/                     1
  └─ root-level .vue            81 (non-Echo*)

frontend/src/components/Echo*.vue   4  (design-system primitives today)
frontend/src/features/              26 domain folders (see features/README.md)
frontend/src/views/                  5  (route shells — out of P1 scope)
frontend/src/composables/          137  (P2; not moved in P1)
```

**Existing guards (relevant):**

| Script                                         | What it does today                                    | P1 change                                              |
| ---------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `scripts/check-frontend-modularization.mjs`    | Line-count report; **hard-fails ≥700 lines**          | Keep as size guard; **do not** overload with placement |
| `scripts/check-god-file-ratchet.mjs`           | Baseline ceiling per oversized file                   | Unchanged                                              |
| `scripts/check-new-code-charter.mjs`           | Post-cutoff quality ratchet                           | Unchanged                                              |
| `scripts/check-voice-activity-conventions.mjs` | **Template for P1 guard** — allowlist may only shrink | Mirror pattern for placement                           |

`modularity:check` is **not** in `test:ci:guards` today. P1 adds a **new** guard there.

---

## Leg 1 — Decide (SSOT)

**Deliverable:** [code-placement.md](./code-placement.md)  
**Also update:** `frontend/src/features/README.md`, link from [AGENTS.md](../../AGENTS.md) and [docs/echo-code-charter.md](../echo-code-charter.md) (new rule **C13 — Code placement**, enforcement: CI).

### Rules (canonical)

#### `frontend/src/features/<domain>/` — feature home

Every feature-owned UI/logic file lives under **exactly one** domain folder. Required subfolders (create empty `index.ts` barrels where useful):

```
features/<domain>/
  components/     # feature-specific .vue
  composables/    # use* orchestration
  stores/         # Pinia (*Store.ts) — optional
  services/       # API/command wrappers — optional
  types/          # feature-local types — optional
  index.ts        # public surface (re-exports only)
```

**Domain list (existing + targets for migration):**

| Domain                  | Already in `features/` | Absorbs from `components/`                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat`                  | partial (7 `.vue`)     | **`components/chat/`** (69 files)                                                                                                                                                                                                                                         |
| `auth`                  | yes                    | `components/auth/`, `LoginRegisterModal`, `Guest*`, `UnverifiedEmailModal`                                                                                                                                                                                                |
| `dm`                    | yes                    | `DMPanel`, `DMCallView`, `DMProfilePanel`, `GroupDM*`, `MessageRequestsView`, `DmNotificationsView`                                                                                                                                                                       |
| `layout`                | yes                    | `AppLayout*`, `MoreServer*`, `MyServersPanel`, `ExploreServersPanel`, `ServerList`, `MemberList`, `DesktopTitlebar`, `Deploy*`, `ActionRail*`                                                                                                                             |
| `channel-panel`         | yes                    | `ChannelPanel.vue` (modal/shell only if not already duplicated)                                                                                                                                                                                                           |
| `channel-settings`      | yes                    | `ChannelSettingsModal`, `CategorySettingsModal`, `CreateCategoryModal`, `CreateChannelModal`, `ChannelIconPickerPopover`                                                                                                                                                  |
| `server-settings`       | yes                    | `ServerSettingsModal`, `ServerApplicationModal`, `ServerNotificationSettingsModal`, `InviteUsersModal`, `LeaveServerConfirmModal`, `JoinServerConfirmModal`, `AddServerModal`, `BannerRepositionModal`                                                                    |
| `voice`                 | yes                    | `CallView`, `CallRingtone*`, `CameraPreview`, `ScreenSharePickerModal`, `StreamVideoTile`, `VideoTrackRenderer`, `FullscreenStreamOverlay`, `DesktopStreamingControlModal`, `GuildVoiceActivityStrip`, `useCallView*`                                                     |
| `server-events`         | yes                    | `GuildEventActivityStrip`                                                                                                                                                                                                                                                 |
| `settings`              | yes                    | `SettingsModal`                                                                                                                                                                                                                                                           |
| `navigation`            | new or `layout`        | `FriendsView`, `ExploreView` (decide: **`layout`** — they are shell routes)                                                                                                                                                                                               |
| `safety`                | yes                    | `ReportModal`, `ModerationActionModal`, `BugReportModal`                                                                                                                                                                                                                  |
| `discord`               | yes                    | `DiscordProfileImportPromptModal`                                                                                                                                                                                                                                         |
| `attachments` / `media` | partial                | `components/media/` → **`features/chat/components/media/`** or `features/attachments/` (pick one in PR-1.1; default: **`chat`** for message embed players)                                                                                                                |
| `member-profile`        | —                      | `components/member-profile/`, `MemberProfilePopout`, `ExpandedProfileModal`, `SelfProfilePopout`, `ProfileBannerMedia`, `ProfileCustomStatusThoughtBubble` → **`features/layout`** or new **`features/member-profile`** (default: **`layout`** — popouts are shell-owned) |

#### `frontend/src/components/` — design-system primitives only

Allowed without allowlist entry:

- `Echo*.vue` — shared Echo UI primitives (today: `EchoDateTimePicker`, `EchoDropdown`, `EchoHoverHintsHost`, `EchoSegmentedControl`)
- Explicit allowlist in `scripts/code-placement-allowlist.json` for **non-Echo** shared widgets that are genuinely cross-feature (initial entries below)

**Initial primitive allowlist (non-Echo, stays in `components/`):**

| File                       | Rationale                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `TwemojiText.vue`          | Emoji rendering primitive used everywhere                                            |
| `StatusIndicator.vue`      | Presence dot primitive                                                               |
| `LimitedGifImg.vue`        | GIF budget primitive                                                                 |
| `PausedGifAvatar.vue`      | Avatar GIF primitive                                                                 |
| `EmojiCategorySection.vue` | Emoji picker section primitive                                                       |
| `LegalDocsModal.vue`       | Legal shell (or move to `features/settings` in a later PR — grandfather until moved) |

Everything else in `components/` is **legacy placement** and must migrate or be added to a shrinking grandfather allowlist.

#### Out of P1 scope (document, do not move yet)

- `frontend/src/views/` — route entry shells
- `frontend/src/composables/` (137 files) — P2 layer manifest
- `frontend/src/App.vue` — app bootstrap

---

## Leg 2 — Enforce (CI)

**Deliverables:** new guard + baselines + `test:ci:guards` wire-up + pre-commit staged mode.

### New script: `scripts/check-code-placement.mjs`

Modeled on `check-voice-activity-conventions.mjs` + `check-god-file-ratchet.mjs`.

**Mechanical rules (fail on violation unless grandfathered):**

| Rule ID | Check                                                                                                             | Post-cutoff behavior                         |
| ------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `CP-1`  | New `.vue`/`.ts`/`.scss` under `frontend/src/components/` not matching `Echo*.vue` and not in primitive allowlist | **FAIL**                                     |
| `CP-2`  | New file under `frontend/src/components/<subdir>/` (any subdir)                                                   | **FAIL** — subdirs must empty out            |
| `CP-3`  | New `features/<domain>/` folder missing any of `components/`, `composables/`, `index.ts`                          | **WARN → FAIL** after bootstrap PR           |
| `CP-4`  | `components/` total file count (`.vue`+`.ts`+`.scss`, recursive) > baseline                                       | **FAIL**                                     |
| `CP-5`  | Grandfather allowlist entry for a path that no longer exists                                                      | **FAIL** (stale entry — same as voice guard) |

**Config files:**

```
scripts/code-placement-config.json      # paths, allowed primitive globs
scripts/code-placement-allowlist.json   # grandfathered legacy paths (may only shrink)
scripts/code-placement-baselines.json     # { "componentsFileCount": 195 }
```

**Bootstrap allowlist:** seed with every file currently under `components/` that is not an allowed primitive (~190 paths). Each migration PR **deletes** entries for moved files and **lowers** `componentsFileCount`.

### Wire into CI

```json
// package.json test:ci:guards — append:
"node scripts/check-code-placement.mjs"
```

Add npm script:

```json
"placement:check": "node scripts/check-code-placement.mjs"
```

**Pre-commit:** extend `scripts/githooks/pre-commit` with staged-only check (same pattern as `check-god-file-ratchet.mjs --staged`):

```bash
node scripts/check-code-placement.mjs --staged
```

**Post-cutoff:** files not in grandfather manifest and not primitives → strict CP-1/CP-2 immediately (reuse `new-code-charter-grandfather.json` cutoff date **2026-06-01** or dedicated placement cutoff **2026-06-15** — pick one date in PR-0 and document in charter C13).

### Do **not** extend `check-frontend-modularization.mjs`

That script is a **line-count** tool (`modularity:check`). Placement is orthogonal; keep them separate so failures are actionable.

---

## Leg 3 — Migrate (move-only PRs)

**Rules for every migration PR:**

1. **Move only** — `git mv`; no behavior changes in the same PR.
2. Update **import paths** (`@/components/...` → `@/features/<domain>/...`).
3. Update **god-file baselines** paths if any moved file is baselined.
4. Update **new-code-charter enrollment** paths if enrolled.
5. Remove moved paths from **`code-placement-allowlist.json`**; decrement **`componentsFileCount`** baseline.
6. Run `npm run ci:precheck` (or at minimum `placement:check`, `god-file:check`, frontend build + affected tests).

### PR sequence (ordered by blast radius)

| PR       | Scope                                                                              | Files ≈                   | Notes                                                                    |
| -------- | ---------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| **P1-0** | Leg 1 doc + Leg 2 guard (grandfather seeded, CI wired)                             | +3 scripts, +2 json, docs | **No file moves.** CI passes with baseline 195.                          |
| **P1-1** | `components/chat/` → `features/chat/`                                              | 69                        | ~~Highest duplication~~ **Done** (126 files remain in `components/`)     |
| **P1-2** | DM cluster → `features/dm/`                                                        | ~10                       | **Done**                                                                 |
| **P1-3** | Auth cluster → `features/auth/`                                                    | 9                         | **Done**                                                                 |
| **P1-4** | Voice/call chrome → `features/voice/`                                              | 19                        | **Done**                                                                 |
| **P1-5** | Server/channel modals → `features/server-settings/` + `features/channel-settings/` | ~12                       | **Done**                                                                 |
| **P1-6** | Layout shell → `features/layout/`                                                  | ~27                       | **Done** — `AppLayout*`, `MoreServer*`, rails, explore/my-servers panels |
| **P1-7** | Member profile → `features/layout/components/member-profile/`                      | ~19                       | **Done** — popouts + `member-profile/` subtree                           |
| **P1-8** | Remaining root modals → domain features                                            | 10                        | **Done** — `SettingsModal`, safety, discord, E2EE, server chrome widgets |
| **P1-9** | `media/` → `features/chat/components/media/`; primitive-only `components/`         | 8                         | **Done** — allowlist empty, no subdirs, baseline **10**                  |

**P1 program complete.** Feature placement SSOT: [code-placement.md](./code-placement.md).

**Parallelization:** P1-1..P1-3 can run sequentially first (chat/dm/auth touch the most imports). P1-4..P1-8 can be parallelized after P1-1 lands.

### Import churn estimate

~150+ files import from `@/components/` (grep count across `frontend/src`). Expect each migration PR to touch 2–3× moved files in import updates. Use ripgrep after each move:

```bash
rg -l '@/components/chat/' frontend/src | xargs -r sed -i 's|@/components/chat/|@/features/chat/|g'
```

(Prefer codemod or manual review for ambiguous paths.)

---

## Definition of done (acceptance checklist)

- [x] [code-placement.md](./code-placement.md) exists; linked from `AGENTS.md` + charter C13
- [x] `npm run placement:check` passes on `main`
- [x] `check-code-placement.mjs` is in `test:ci:guards` and pre-commit `--staged`
- [x] `scripts/code-placement-allowlist.json` **`legacyPaths` empty** (primitives via `code-placement-config.json`)
- [x] `scripts/code-placement-baselines.json` → `componentsFileCount` **10**
- [x] `frontend/src/components/` has **no subdirectories**
- [x] `rg 'frontend/src/components/(chat|auth|media)/' frontend/src` returns **0** hits
- [x] Placing a new `FooPanel.vue` in `components/` fails CI with a clear message pointing at `code-placement.md`

---

## Risks and mitigations

| Risk                                         | Mitigation                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Large import churn breaks build mid-series   | Move-only PRs; mandatory `ci:precheck` per PR                           |
| God-file / charter enrollment paths go stale | Include baseline enrollment updates in each PR template                 |
| Debate over primitive vs feature             | Lock primitive allowlist in SSOT; changes need architecture review      |
| `AppLayout.vue` (3586 lines) moves last      | Keep in allowlist until P1-6; size is charter C4, not placement blocker |
| Agents keep generating into `components/`    | Pre-commit `--staged` + pointer in `AGENTS.md`                          |

---

## PR-0 implementation checklist (next action)

1. ~~Write [code-placement.md](./code-placement.md)~~ ✓
2. ~~Add `scripts/check-code-placement.mjs` + config/allowlist/baselines JSON~~ ✓
3. ~~Seed allowlist from `find frontend/src/components -type f`~~ ✓ (179 legacy, 195 total)
4. ~~Set `componentsFileCount: 195`~~ ✓
5. ~~Wire `placement:check` + `test:ci:guards`~~ ✓
6. ~~Add charter **C13** row~~ ✓
7. ~~Update `features/README.md`~~ ✓
8. ~~Link from `AGENTS.md`~~ ✓
9. ~~Pre-commit `--staged`~~ ✓

**Next:** None — P1 complete. Ongoing: new UI under `features/<domain>/` only.
