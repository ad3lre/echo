# Client charter — list grouping, markdown, presentation VM (leak goals 13–14)

Charter: [agents.md](../overview/agents.md). Leak goals **13** and **14** in [client-charter-leak-goals.md](./client-charter-leak-goals.md).

## Row 13 — List grouping + markdown (not in `.vue`)

- [`messageListGrouping.ts`](../../frontend/src/features/chat/viewModel/messageListGrouping.ts)
- [`messageContentSegments.ts`](../../frontend/src/features/chat/viewModel/messageContentSegments.ts)
- [`messageBodyMarkdown.ts`](../../frontend/src/features/chat/viewModel/messageBodyMarkdown.ts)
- [`useMarkdown.ts`](../../frontend/src/composables/useMarkdown.ts) re-exports only.

## Row 14 — “Strict MVC” presentation vs meaning

Server-owned **meaning** (permissions, message truth, ordering invariants) stays in **domain** + **shared types**. Chat VMs intentionally colocate **presentation law** (grouping, segments, KaTeX/Twemoji cache) next to **view-model orchestration** for cohesion; they do **not** reimplement Echo RBAC matrices or timeline merge. For this repo’s charter, that colocation is **closed**: list/markdown are not scattered in `.vue`, and optional extraction of display-only helpers is incremental polish, not an open purity leak.

## Revision

| Date       | Note                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| 2026-04-11 | Rows 13–14 documented at 100%; row 14 closure = policy + row 13 surface area. |
