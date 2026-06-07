import type { VcActivityPresenceKind } from '@/features/voice/vcActivityTypes';

/** Compact presence: which VC activity surfaces each peer has open (sent over LiveKit data). */
export type EchoVcActivityPresenceV1 = {
  v: 1;
  t: 'vc_activity_presence';
  updatedAt: number;
  activities: VcActivityPresenceKind[];
};

export function encodeEchoVcActivityPresence(
  p: EchoVcActivityPresenceV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoVcActivityPresence(
  raw: Uint8Array,
): EchoVcActivityPresenceV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoVcActivityPresenceV1;
    if (o?.v !== 1 || o?.t !== 'vc_activity_presence') return null;
    if (typeof o.updatedAt !== 'number') return null;
    if (!Array.isArray(o.activities)) return null;
    const activities: VcActivityPresenceKind[] = [];
    for (const a of o.activities) {
      if (
        a === 'youtube' ||
        a === 'activities' ||
        a === 'wordle' ||
        a === 'hangman' ||
        a === 'skriggles' ||
        a === 'openguessr' ||
        a === 'skribbl_io' ||
        a === 'gartic_phone' ||
        a === 'krunker' ||
        a === 'codenames' ||
        a === 'richup' ||
        a === 'goober_dash' ||
        a === 'smash_karts' ||
        a === 'cluster_rush' ||
        a === 'tic_tac_toe'
      ) {
        activities.push(a);
      }
    }
    return { ...o, activities };
  } catch {
    return null;
  }
}
