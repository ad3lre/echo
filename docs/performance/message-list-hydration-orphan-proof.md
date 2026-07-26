# Hydration orphan proof (Phase 1a)

Traced every output of `useMessageRowHydration` against MessageList + template (2026-07-24).

## Template

- `MessageRowShell.vue` is **never** rendered. Virtual rows always mount `MessageBubble`.
- Row `:key` is `virtualizerOrderedIds[virtualRow.index]` (stable message id). **No** hydration epoch in keys.

## Outputs and impact

| Output                                             | Affects                                                                        | Verdict                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `hydrationEpoch`                                   | Watcher → `scheduleHydratedRowRemeasure` → invalidate heights + remeasure      | **Load-bearing only as remount/remeasure churn** — not UI swap. Base path already measures via ResizeObserver + `scheduleVirtualRowMeasure`. |
| `forceHydrateMessage` / `ensureVirtualRowHydrated` | Marks id hydrated + bumps epoch                                                | **No visual effect**; triggers remount path.                                                                                                 |
| `isRowHydrated`                                    | Gates remeasure after row-facts patch                                          | Without hydration, content patches can call `remeasureVisibleVirtualRows` / existing resize path instead.                                    |
| `scheduleHydrationPass` / queue                    | Marks visible ids hydrated in batches                                          | **Dead for rendering** — shell never shown.                                                                                                  |
| `resetForChannel` / channel watch epoch bump       | Clears queue + remount pressure                                                | Unnecessary once queue gone.                                                                                                                 |
| Height store (`messageRowHeightStore`)             | Used by `estimateSize` / `initialMeasurementsCache` independently of hydration | **Keep**.                                                                                                                                    |
| Revision keys (`messageRowRevisionKey`)            | Invalidate cached heights on geometry change                                   | **Keep** — independent of hydration.                                                                                                         |
| `getItemKey`                                       | Message id only                                                                | **Unaffected**.                                                                                                                              |
| Attachment / rich-block mounting                   | Always via MessageBubble                                                       | **Unaffected**.                                                                                                                              |

## Tests encoding hydration

- `useMessageRowHydration.test.ts`, `messageRowHydrationQueue.test.ts`, `messageRowShellLayout.test.ts` — unit tests of the subsystem itself.
- `MessageList.runtime.test.ts` / `MessageList.loadOlderSkeleton.test.ts` mock `MessageRowShell` but template does not use it.

## Conclusion

Hydration is **orphaned as a presentation system**. Remaining effects are **epoch-driven remount/remeasure** that the base measure path already covers. Safe to remove in one vertical slice (Commit B) then delete files (Commit C). Do **not** leave the queue running without consumers.
