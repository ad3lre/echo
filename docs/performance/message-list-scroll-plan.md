# Message list: plan for buttery-smooth scroll

This document is **strictly** about **scroll feel** (frame time, layout stability, reactive invalidation). It is **not** about cache architecture, pagination policy, or the 400-message client cap—those affect **network and refetch behavior**, not primary scroll jank.

---

## 1. Causal model (do not skip)

### 1.1 Root cause (precise)

**Scroll-time reactive coupling** to `**O(n)` derived message work** that **emits unstable identity** under **reactive recomputation pressure\*\*.

Causal chain (usually not “either/or”):

1. `**O(n)` derived transforms** → **cost\*\* (work per invalidation).
2. **Unstable identity from those outputs** → **invalidation amplification** (how often downstream recomputes).
3. In this UI pattern, **(2) is often fed by (1)**.

### 1.2 Primary failure mode

**Unbounded recompute surface** on a **hot path**: scroll events (sync, high frequency) plus **async layout mutations** (image/embed decode, late content).

### 1.3 Amplifier loop (asymmetric)

The painful loop is **not** symmetric step-for-step:

1. **Async**: media/embed finishes → row height changes.
2. **Virtualizer**: **scroll compensation** (adjust `scrollTop` / preserve anchor)—**not** “measure again” alone.
3. **Sync**: **scroll events** fire.
4. **Reactive**: updates rerun computeds / virtualizer inputs.
5. Further layout → repeat.

**Asymmetry:** async layout mutation is **injected into** a **sync scroll pipeline**. That mismatch produces the **“fight the scroll wheel”** feel.

### 1.4 Overscan (multiplier, not root)

**Higher overscan** increases:

- mounted DOM nodes,
- active resize observers,
- **probability** that **multiple rows** change height in the **same frame window**.

So it **expands the probability space** for overlapping layout shifts, amplifying the loop above—not merely “more measure calls.”

---

## 2. Non-goals (explicit)

| Topic                                         | Why out of scope for “buttery scroll”                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Cursor/page cache, IndexedDB, LRU pages       | Correctness, refetch, memory **policy**; does not fix frame-time scroll.            |
| Increasing `ECHO_CHANNEL_MESSAGES_CLIENT_CAP` | Primarily **network churn** when revisiting evicted history; not scroll smoothness. |
| “Just use more `overscan`”                    | Can **worsen** instability when heights are variable.                               |

---

## 3. Current code touchpoints

| Area                           | File                                                    | Notes                                                                                          |
| ------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Virtualizer + scroll           | `frontend/src/features/chat/components/MessageList.vue` | `useVirtualizer` computed, `onScrollCombined`, `estimateSize`, `overscan`, `orderKey` fallback |
| Message index / order revision | `frontend/src/stores/messageIndex.ts`                   | `orderRevision`, `getChannelIndex`                                                             |
| Row measure                    | `MessageList.vue`                                       | `measureElement` deferred via `requestAnimationFrame`                                          |

**Known defect pattern:** when `activeChannelIndex` is null (e.g. no `channelId`), `orderKey` falls back to:

`msgs.map((m) => m.id ?? '').join('\u001e')` — `**O(n)` string rebuild** on every reactive recompute of that computed. That is **cost + unstable identity risk\*\* relative to a monotonic key.

When `channelId` is set, the path uses `${orderRevision}:${msgs.length}` — **O(1)** for the key string; still verify the **rest** of the virtualizer computed does not depend unnecessarily on `**props.messages` reference identity\*\*.

---

## 4. Plan phases (strict order)

Phases are **ordered by causality**. Do **not** reorder for convenience.

### Phase A — Identity and virtualizer inputs (invalidation + cost)

**Goal:** No scroll-time path may depend on **full-list scans** for virtualizer **order/identity**. Recomputation must not change **identity** when **semantic order/length** are unchanged.

| Step | Action                                                                                                                                                                                                                                                                               | Acceptance                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| A.1  | **Remove** the `msgs.map(...).join(...)` `orderKey` fallback. Replace with an **O(1)** signal: e.g. `orderRevision:channelId:length` from the **same** `getChannelIndex` used for Echo channels, or a dedicated monotonic **list generation** ref bumped only on semantic mutations. | Profiling / logging: `orderKey` string construction is **never** proportional to `msgs.length`.                                        |
| A.2  | Audit the `useVirtualizer` **computed** dependency list. Ensure it does **not** re-run solely because `**props.messages` array reference\*\* changed if content is semantically identical (or narrow deps to `length`, `channelId`, `orderRevision`, and stable getters).            | Synthetic test: replace array reference with same ids/order → virtualizer **options identity** stable or TanStack does not full-reset. |
| A.3  | Confirm `getItemKey` uses **stable message ids** only; avoid index-only keys for real rows.                                                                                                                                                                                          | No duplicate-key churn; keys stable across prepend.                                                                                    |

**Verification:** Vue devtools / temporary counters: scroll-only gestures (no new messages) do **not** spike **virtualizer options** recomputation or **full message-array** derivations.

---

### Phase B — Decouple scroll from reactive breadth

**Goal:** Scroll is a **hot event**; it must not widen the **dependency surface** of message list derivation.

| Step | Action                                                                                                                                                                                                                                              | Acceptance                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| B.1  | **Jump-to-bottom / “away from bottom” UI:** drive from **non-reactive** or **narrowly scoped** state updated on **rAF-throttled** scroll (or **IntersectionObserver** on sentinel nodes), not from computeds that **read `props.messages` deeply**. | Scroll handler does not trigger **full** `MessageWithAuthor[]` recomputation chains. |
| B.2  | Avoid **watchers** on scroll-adjacent state that **touch** large message structures unless **debounced** or **guarded** by real semantic change.                                                                                                    | Same as A.2: scroll-only → no O(n) message work.                                     |
| B.3  | Keep `**onScrollLoadOlder`** as the only scroll path that may **async** fetch; ensure it does not synchronously **mutate\*\* reactive inputs that rebuild the whole virtualizer config before `requestAnimationFrame`.                              | One scroll tick → bounded synchronous work.                                          |

**Verification:** Performance panel: scroll **without** network shows **minimal** Vue component update count for message rows; no repeated **full-list** computed execution.

---

### Phase C — Layout predictability (UX lever #1 for “smooth”)

**Goal:** Reduce **async height mutation** and therefore **scroll compensation** frequency.

| Step | Action                                                                                                                                                                                                          | Acceptance                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| C.1  | Replace flat `**estimateSize: () => 88`** with **per-message-type** estimates (text-only vs embed vs image vs poll), optionally using **known attachment aspect\*\* when available.                             | Fewer large measure deltas on first paint.                                                                 |
| C.2  | **Reserve space** for media before decode: fixed min-height / aspect placeholder / skeleton box so decode does not jump from **zero** to **full** height.                                                       | Reduced **post-load** height delta for typical image messages.                                             |
| C.3  | **Images:** explicit `width`/`height` or CSS aspect-ratio from metadata where possible; lazy decode policies if compatible with UX.                                                                             | Layout shift score improves on representative threads.                                                     |
| C.4  | Revisit `**shouldAdjustScrollPositionOnItemSizeChange`** in `MessageList.vue` together with C.1–C.3; document **invariants\*\* (when compensation is allowed vs suppressed) per anchor mode (`top` / `bottom`). | No **fight-the-user** compensation while user is actively scrolling, unless product-invariant requires it. |

**Verification:** Record trace: image-heavy channel scroll shows **fewer** layout thrash bars per second; **less** scroll correction immediately after decode events.

---

### Phase D — Virtualizer surface area (multipliers)

**Goal:** Fewer simultaneous unstable rows and fewer option resets.

| Step | Action                                                                                                                                              | Acceptance                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| D.1  | **Lower `overscan`** from `14` toward a **measured** value (e.g. 3–8) **after** C.1–C.3; retune if blanking appears during fast flick scroll.       | Same scroll test: fewer active observers / mounted rows during steady scroll. |
| D.2  | Ensure **one** source of truth passes **count** and **keys** into TanStack; avoid duplicate reactive pipelines (parent + child both deriving list). | Single derivation path per channel.                                           |

---

### Phase E — Optional follow-ups (only after A–D)

| Step | Action                                       | Note                                                                        |
| ---- | -------------------------------------------- | --------------------------------------------------------------------------- |
| E.1  | **Top loading indicator** for `loadingOlder` | Product clarity; **minor** impact on scroll physics.                        |
| E.2  | Cache / paging redesign                      | **Separate** doc; improves refetch and memory **policy**, not primary jank. |

---

## 5. Definition of done (“buttery” — measurable)

Minimum bar (adjust thresholds per device class):

1. **Scroll-only** (no new messages, no images still loading): **no** `O(n)` work per frame attributable to message list identity/order; **stable** virtualizer config across ticks.
2. **Image-heavy** channel: **materially fewer** layout-shift-driven **scroll compensation** events per second vs baseline trace.
3. **User perception:** no **repeated yank** against wheel direction while scrolling; jump-to-bottom affordance does not cause **visible** main-thread stalls.

Use **Performance** + **Vue DevTools (timeline)** + **Layout Shift** (where applicable) to prove regressions/improvements.

---

## 6. Summary sentence

**Cache/page model** addresses **correctness and network behavior**. **Buttery scroll** requires: **(A)** stable **O(1)** virtualizer identity, **(B)** **no** scroll-time coupling to **O(n)** message derivations, **(C)** **predictable row heights** to starve the **async-layout → scroll-compensation → reactive** loop, **(D)** **reduced** concurrent unstable row surface (**overscan**).

---

## 7. Revision

| Date       | Change                                            |
| ---------- | ------------------------------------------------- |
| 2026-04-10 | Initial plan from performance analysis consensus. |
