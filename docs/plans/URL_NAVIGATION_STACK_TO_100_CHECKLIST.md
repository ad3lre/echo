# URL navigation stack — charter path to 100% _(achieved checklist)_

**Hotspot:** URL navigation extraction is complete; charter context lives in [`client-charter-violations.md`](../../architecture/client-charter-violations.md) and [`agents.md`](../../overview/agents.md).

**Non-goals:** UX redesign; refactors to [`useAppLayoutController.ts`](../../../clients/web/src/features/layout/composables/controller/useAppLayoutController.ts) (separate hotspot).

---

## Definition of done (100%)

- [x] Workspace-aware guild fallbacks and channel validation live in pure [`urlNavigationResolve.ts`](../../../clients/web/src/features/layout/urlNavigationResolve.ts) (`pickFallbackParsedPath`, `resolveGuildPath`, `channelValidInServer`).
- [x] Pre-apply pathname normalization (guild adjust, `unknown` → fallback) in [`urlNavigationLocationNormalize.ts`](../../../clients/web/src/features/layout/urlNavigationLocationNormalize.ts) (`normalizeBrowserPathParsed`).
- [x] Modal query open/strip + desired search patch in [`urlNavigationModalPolicy.ts`](../../../clients/web/src/features/layout/urlNavigationModalPolicy.ts) (`planModalQueryEffectsFromUrl`, `buildModalSearchPatchFromState`).
- [x] [`useUrlNavigationSync.ts`](../../../clients/web/src/features/layout/composables/shell/useUrlNavigationSync.ts) = History API + watches + ref wiring; parse/format + surface→path remain [`urlNavigation.ts`](../../../clients/web/src/features/layout/urlNavigation.ts); rail transitions remain [`navigationReducer.ts`](../../../clients/web/src/features/layout/navigationReducer.ts).
- [x] Unit tests: `urlNavigationResolve.test.ts`, `urlNavigationLocationNormalize.test.ts`, `urlNavigationModalPolicy.test.ts` (plus existing `urlNavigation.test.ts`, `navigationReducer.test.ts`).
- [x] Scorecard row **URL navigation stack** at **100%**, revision + weighted overall updated; [`client-layer-violations.md`](../../architecture/client-layer-violations.md) §6 updated.

---

## Phase 0 — Inventory (duplicate URL priority logic)

**Finding:** `parseAppPathname` / `formatAppPathname` are only defined in `urlNavigation.ts` and consumed from `useUrlNavigationSync` and tests. Workspace **resolution** is not duplicated elsewhere; `resolveGuildPath` / `pickFallbackParsedPath` appear only in `urlNavigationResolve.ts`, `urlNavigationLocationNormalize.ts`, and `useUrlNavigationSync` (delegating to the pure module).

---

## Notes

- DM path application (`applyDmSubPath`) still uses `reduceNavigation` / `applyNavStateToRefs` inside the composable; behavior matches prior implementation and is covered indirectly via shell navigation. Further extraction to a pure “intent applier” is optional.
