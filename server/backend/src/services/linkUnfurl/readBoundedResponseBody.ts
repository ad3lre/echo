/** Bound decoded bytes while streaming; Content-Length is not a trusted limit. */
export async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, total);
      total += value.byteLength;
      if (total > maxBytes) throw new Error('Response body exceeds byte limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
