export type DeferredTaskHandle = {
  cancel: () => void;
};

export type ScheduleDeferredTaskOptions = {
  timeoutMs?: number;
  fallbackDelayMs?: number;
};

export function scheduleDeferredTask(
  task: () => void,
  options: ScheduleDeferredTaskOptions = {},
): DeferredTaskHandle {
  const { timeoutMs = 1500, fallbackDelayMs = 250 } = options;
  const idleApi = globalThis as typeof globalThis & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (
    typeof idleApi.requestIdleCallback === 'function' &&
    typeof idleApi.cancelIdleCallback === 'function'
  ) {
    const id = idleApi.requestIdleCallback(
      () => {
        task();
      },
      { timeout: timeoutMs },
    );
    return {
      cancel: () => {
        idleApi.cancelIdleCallback?.(id);
      },
    };
  }
  const id = globalThis.setTimeout(() => {
    task();
  }, fallbackDelayMs);
  return {
    cancel: () => {
      globalThis.clearTimeout(id);
    },
  };
}
