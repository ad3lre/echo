/**
 * **Layer 2 — micro-optimizations** (after viewport contract + dumb data flow).
 *
 * Use this checklist when profiling, not when fixing correctness:
 *
 * - **Containment** — isolate row layout (`contain: layout` on virtual rows) so list-wide
 *   relayout does not recurse into every subtree.
 * - **will-change** — sparingly (e.g. transforms); many layers hurt GPU memory — prefer
 *   containment first.
 * - **Passive listeners** — scroll on the list container is `{ passive: true }` (cannot
 *   call `preventDefault`; use capture elsewhere if you must block).
 * - **Cached date formatting** — long day-separator strings go through a bounded cache in
 *   `formatMessageListDaySeparatorLabel` (Today/Yesterday stay uncached).
 * - **Reply maps** — resolve reply targets via `Map` lookups (`entitiesById` / visible map),
 *   not scans.
 * - **Handler memoization** — `MessageList` caches stable per-message callbacks (vote,
 *   react, pin) so rows do not close over new lambdas every render.
 *
 * If the list still feels “smart,” fix authority / anchors first — see
 * `@/features/chat/domain/viewportContract`.
 */

export {};
