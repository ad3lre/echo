/** Structured trace hook (prefetch failures, etc.). Intentionally silent — use devtools / Bug Hunter when needed. */
export function echoDevTrace(
  _event: string,
  _meta: Record<string, unknown> = {},
): void {}
