# Failure propagation contract

This document describes the frontend contract for **user-impacting** async/realtime operations: they must not fail silently.

## Rule

No async or realtime submit path in a user-facing flow may fail without **both**:

1. **User-visible feedback** — via `UIErrorBus` (dismissible app banner, optional **Retry**).
2. **Structured logging** — via `reportPrimaryFlowFailure` with `showBanner: false` when the UI bus already showed the error (avoids duplicate banners).

## `ActionResult`

Defined in [`frontend/src/types/actionResult.ts`](../../frontend/src/types/actionResult.ts):

- `ok: boolean`
- `error?: { code: string; userMessage: string; retryable: boolean }`

Helpers: `okResult()`, `failResult()`, `toFailResultFromUnknown()`.

Socket submit helpers in [`useSocket.ts`](../../frontend/src/composables/useSocket.ts) return `Promise<ActionResult>` for poll votes, reactions, pins, unpins, and message edits when live realtime is expected.

## Mandatory call pattern

```ts
const result = await action();
if (!result.ok) {
  propagateActionFailure(result, {
    flow: 'domain.operation',
    context: 'short_ui_context_key',
    severity: 'error', // or 'warning' | 'info'
    retryAction: optionalRetryFn,
    extraContext: {
      /* optional */
    },
    cause: originalError,
  });
  return;
}
```

[`propagateActionFailure`](../../frontend/src/utils/actionFailurePropagation.ts) performs `UIErrorBus.emit` + `reportPrimaryFlowFailure(..., { showBanner: false })`.

## `UIErrorBus`

- Module: [`frontend/src/utils/uiErrorBus.ts`](../../frontend/src/utils/uiErrorBus.ts)
- API: `UIErrorBus.emit(payload)` / `subscribeUIErrors(handler)`
- Payload: `context`, `severity` (`info` | `warning` | `error`), `userMessage`, optional `code`, `retryable`, `retryAction`
- App shell: [`AppLayout.vue`](../../frontend/src/components/AppLayout.vue) subscribes and passes state into [`AppLayoutInfoBanners.vue`](../../frontend/src/features/layout/components/AppLayoutInfoBanners.vue)

## Relation to primary flow failures

- **Primary flow banner** (`subscribePrimaryFlowFailures`) remains for historical flows that dispatch `echo-primary-flow-failure` directly (e.g. some REST failures, socket connect errors).
- **UI error banner** is preferred for granular, retryable chat/realtime/navigation failures so copy stays user-friendly and **Retry** can re-run the exact operation.

## Audit traceability (RUN-18 / RUN-19 / RUN-20)

| ID                | Issue                                         | Mitigation                                                                                                                   |
| ----------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| RUN-18            | Reactions / poll votes no-op when socket down | `tryEmitRealtime` → `ActionResult`; reactions use transactions + rollback; `handlePollVote` checks submit result             |
| RUN-19            | Quote jump missed virtualized messages        | `MessageBubble` delegates to `onGoToMessage` when `channelId` + handler exist; navigator + prefetch return `ActionResult`    |
| RUN-20            | Prefetch loop swallowed page errors           | `prefetchUntilMessageVisible` reports + `propagateActionFailure` on every fetch failure path                                 |
| Socket visibility | Mid-session disconnect invisible              | `socket.on('disconnect', …)` → `UIErrorBus` info banner (debounced); intentional teardown removes listener before disconnect |

## Tests

- [`frontend/src/types/actionResult.test.ts`](../../frontend/src/types/actionResult.test.ts)
- [`frontend/src/utils/uiErrorBus.test.ts`](../../frontend/src/utils/uiErrorBus.test.ts) (`@vitest-environment jsdom` — DOM `window` required)
