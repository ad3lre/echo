/** Injection key: true while the user is actively scrolling the message list. */
export const MESSAGE_LIST_SCROLL_GESTURE_ACTIVE_KEY = Symbol(
  'messageListScrollGestureActive',
);

/** Injection key: callback to notify chat surface of scroll-active compositor state. */
export const MESSAGE_LIST_SCROLL_SURFACE_KEY = Symbol(
  'messageListScrollSurface',
);

export type MessageListScrollSurfaceApi = {
  setScrollGestureActive: (active: boolean) => void;
};
