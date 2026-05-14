# Channel message UX — Step 2 evaluation (after Step 1 local fixes)

Step 1 addressed: hover action clipping gutter, higher virtualizer overscan, deferred row measurement, separate history load tokens, and prefetch token behavior.

Step 2 is **manual + diagnostic**: decide whether remaining issues are mostly **contractual** (warrant Step 3: window ownership, scroll identity, prepend transactions, retention) or still **local tuning**.

## When to run this

- After Step 1 is merged and you have a normal dev build (`import.meta.env.DEV`).
- Optional: filter session diagnostics for events listed below (console or diagnostics ingest on localhost).

## Symptom checklist

Answer **yes / no / unsure** for each. Several **yes** answers support moving to Step 3 for the **structural** slice only (not the whole message UI).

| Symptom              | What to try                                                                           | If still “yes”                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Unstable**         | Open a busy text channel, scroll top and bottom repeatedly                            | Jitter, jumps, or list “fighting” after scroll settles                                             |
| **Multi-phase**      | Cold open channel, watch first 2–3 s                                                  | Obvious sequence: empty → partial list → scroll snap → more adjustment                             |
| **Re-loady**         | Scroll up until pagination runs, scroll down, scroll up again over the **same** range | Network or visible refetch for messages you already had (ignore first-time cap trim past 400 msgs) |
| **Weird on revisit** | Switch away and back to same channel                                                  | Scroll position or content differs from expectation without intentional reason                     |
| **Scroll fighting**  | Stay near bottom with new messages / edits                                            | List yanks or resists staying pinned                                                               |

## DEV diagnostics (signal, not proof)

With `import.meta.env.DEV`, the client may emit:

| Event                                       | Meaning                                                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message_list_step2_initial_anchor_settled` | Time from starting initial anchor to settle (`settledMs`), plus `anchor` (`top` / `bottom` / `skipped_empty`). Large values suggest multi-phase UI work after data is ready.                |
| `echo_history_step2_prefetch_pages`         | How many history pages were fetched during jump-to-message prefetch (`pagesLoaded`, `targetFound`). High page counts with slow UX point at API + sequential prefetch, not just virtualizer. |
| `echo_history_step2_load_older`             | Duration and result of one pagination request (`durationMs`, `mergedOlderCount`).                                                                                                           |

Use these to **compare** before/after Step 1 and to **justify** Step 3 scope.

## Decision

- If the checklist is mostly **no** after Step 1: stay with local tuning and profiling (main thread, member list, images).
- If **yes** on unstable / multi-phase / re-loady / revisit / scroll fighting: treat the remainder as **contractual** and plan Step 3 (history/window ownership, anchor/scroll identity, prepend transaction model, retention model) as described in the product technical note.

## Out of scope for Step 2

- No change to business rules or API contracts.
- No replacement of TanStack Virtual or full message UI rewrite.
