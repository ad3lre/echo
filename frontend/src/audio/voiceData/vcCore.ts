export type EchoVcDataV1 = {
  v: 1;
  t: 'public_media';
  kind: 'stream_start' | 'stream_end' | 'video_start' | 'video_end';
  userId: string;
  /** Optional display hint (identity is always sent). */
  name?: string;
};

export function encodeEchoVcData(p: EchoVcDataV1): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

/** Targeted to streamer: viewer stopped watching screen share but stayed in VC. */
export type EchoVcPrivateViewerV1 = {
  v: 1;
  t: 'viewer_stream';
  kind: 'viewer_left_stream';
  viewerId: string;
};

export function encodeEchoVcPrivateViewer(
  p: EchoVcPrivateViewerV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoVcPrivateViewer(
  raw: Uint8Array,
): EchoVcPrivateViewerV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoVcPrivateViewerV1;
    if (o?.v !== 1 || o?.t !== 'viewer_stream') return null;
    if (o.kind !== 'viewer_left_stream') return null;
    if (typeof o.viewerId !== 'string' || !o.viewerId.trim()) return null;
    return o;
  } catch {
    return null;
  }
}

export function decodeEchoVcData(raw: Uint8Array): EchoVcDataV1 | null {
  try {
    const o = JSON.parse(new TextDecoder().decode(raw)) as EchoVcDataV1;
    if (o?.v !== 1 || o?.t !== 'public_media') return null;
    if (
      o.kind !== 'stream_start' &&
      o.kind !== 'stream_end' &&
      o.kind !== 'video_start' &&
      o.kind !== 'video_end'
    ) {
      return null;
    }
    if (typeof o.userId !== 'string' || !o.userId.trim()) return null;
    return o;
  } catch {
    return null;
  }
}
