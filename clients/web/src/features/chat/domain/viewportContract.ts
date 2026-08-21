/**
 * Chat message list — **viewport contract** (hard rules for reviewers).
 *
 * If behavior drifts from these laws, the UI will re-derive “truth” and feel haunted.
 * Change the code **and** update this file when altering boundaries.
 *
 * ## Laws
 *
 * 1. **Ordered visible history** — `messageWindowAuthority` (backed by the channel
 *    index) is the **only** authority for `orderedIds` and per-id entities for the active
 *    channel view. The list **must not** merge sources, reconcile conflicts, or infer order from
 *    scroll position.
 *
 * 2. **Prepend anchor** — Loading older messages preserves the viewport with **anchor
 *    message id** + **pixel offset** inside the scroll container (`PrependSnapshot` in
 *    `messageListPrependAnchor`). Never anchor by list index alone across a prepend.
 *
 * 3. **Row keys** — TanStack virtual rows use **stable message id only** (`getItemKey`).
 *    No composite keys, pure index keys, or revision-churn suffixes for row identity.
 *
 * 4. **Scroll handlers** — Scroll listeners record position, direction, and timing. They
 *    **do not** assign meaning to messages, membership in history, or fetch policy beyond
 *    coarse eligibility (e.g. near-top → may request older).
 *
 * 5. **Grouping** — Clustering (same-author blocks, day separators) is decided in
 *    view-model / domain (`messageListGrouping`, `messageListRowFacts`). **Templates and
 *    presentational components must not** invent grouping rules.
 *
 * 6. **Retention vs refetch** — Client caps trim **oldest** rows when over budget. Prefer
 *    retaining **nearby** loaded history; expose gaps via `hasMoreOlder` and refetch
 *    through history IO, not ad-hoc full list replacement. See `channelMessageBucket` /
 *    `echoHistoryChannelApply`.
 *
 * ## Measurement / scroll subtraction invariants
 *
 * Established before simplifying the measure path (see
 * `messageListSubtractionDiagnostics.ts`):
 *
 * 1. One rendered row → one current revision.
 * 2. One revision → one accepted measured height.
 * 3. A resize schedules at most one pending measurement.
 * 4. Only above-viewport growth may compensate while browsing history.
 * 5. Only pinned + inactive users may receive follow-tail compensation.
 * 6. Every programmatic scroll has an ownership intent.
 * 7. Each height delta has exactly one owner (prepend TX **xor** generic compensation).
 *
 * ---
 * After these laws hold, optional UI micro-optimizations are listed in
 * `messageListMicroPerf.ts` — do not use them to mask authority bugs.
 */

export {};
