# Message list scroll — baseline traces

Record baseline metrics after Phase 0 (correctness land) and after each experiment (A/B/C).

## Enable metrics

```js
localStorage.setItem('echo_message_list_scroll_metrics', '1');
// or ?scrollMetrics=1 on channel URL
```

Read report: `window.__echoMessageListScrollMetrics.getReport()`

## Automated harness

```bash
SCROLL_FIXTURE=geometry SCROLL_MODALITY=wheel \
  frontend/scripts/run-message-list-scroll-verify.sh

SCROLL_FIXTURE=scale SCROLL_MODALITY=wheel \
  frontend/scripts/run-message-list-scroll-verify.sh

SCROLL_FIXTURE=history SCROLL_MODALITY=keyboard \
  frontend/scripts/run-message-list-scroll-verify.sh
```

Fixtures: `geometry` (~80 msgs), `scale` (~200), `history` (~40).

Modalities: `wheel`, `keyboard`, `scrollbar`.

## Experiment flags (bisect)

```js
localStorage.setItem('echo_scroll_exp_a', '1'); // compensation anchor reconcile (default on)
localStorage.setItem('echo_scroll_exp_b', '1'); // resize defer (default on)
localStorage.setItem('echo_scroll_exp_c', '1'); // stable overscan (default on)
localStorage.setItem('echo_scroll_exp_stable_overscan', '20'); // 10 | 20 | 40
localStorage.setItem('echo_scroll_exp_single_measure', '1');
```

Set to `0` to disable an experiment.

## Rollback triggers (initial)

| Metric                        | Threshold         |
| ----------------------------- | ----------------- |
| slotOverlapCount              | > 0               |
| slotOverflowCount             | > 0               |
| blankViewportSamples          | > 4 / 24 bursts   |
| largestPostSettleCorrectionPx | > baseline + 24px |
| settleFlushDurationMs (p95)   | > 16.7ms          |

## Phase 1 gate decision

Ship A+B+C together only if all correctness gates pass and smoothness metrics beat Phase 0 baseline on geometry fixture.

If render pressure remains: descendant throttling (Phase 4A) is enabled via `MESSAGE_LIST_SCROLL_GESTURE_ACTIVE_KEY` — do not enable shell-first unless 4A insufficient.
