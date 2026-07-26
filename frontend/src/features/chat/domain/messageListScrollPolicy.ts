/**
 * Baked message-list scroll/measure policy (no experiment matrix).
 * Former A/B/C localStorage flags are permanently on at these values.
 */

/** Stable overscan (former experiment C). */
export const MESSAGE_LIST_STABLE_OVERSCAN = 20;

/** Always defer ordinary compensation during gestures; reconcile at settle. */
export const MESSAGE_LIST_COMPENSATION_ANCHOR_RECONCILE = true;

/**
 * Bounded resize deferral during active scroll (far off-screen only).
 * Near-viewport growth and content-exceeds-slot always measure immediately —
 * never hard-skip resize commits while the gesture flag is sticky.
 */
export const MESSAGE_LIST_RESIZE_MEASURE_DEFER = true;
