/**
 * Deterministic initials + hue for avatar placeholders (loading / missing pfp).
 * Prefer this over skeleton pulses so every face has a stable visual identity.
 */

/** Up to two letters from a display name ("Com Echo" → "CE", "Danny" → "DA"). */
export function avatarInitialsFromName(
  name: string | null | undefined,
): string {
  const raw = (name ?? '').trim();
  if (!raw) return '?';
  const parts = raw
    .split(/\s+/u)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** Stable hue 0–359 from user id or name so monograms don’t all share one color. */
export function avatarMonogramHue(seed: string | null | undefined): number {
  const id = (seed ?? '').trim() || '?';
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}
