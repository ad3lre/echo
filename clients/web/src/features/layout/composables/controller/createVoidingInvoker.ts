/** Invoke `fn` and discard any returned promise (explicit fire-and-forget). */
export function createVoidingInvoker(fn: () => void | Promise<unknown>) {
  return () => {
    void fn();
  };
}
