/**
 * Layout shell composition root: ordered wiring of region composables + slices.
 * Policy and merge rules live in `frontend/src/services/` and named `useAppLayout*` /
 * `useEcho*` composables — not inline here.
 * Charter definition of “thin”: `docs/architecture/client-layer-violations.md` §1.
 */
import { wireAppLayoutDmAndShell } from './wireAppLayoutDmAndShell';
import { wireAppLayoutVoiceAndRealtime } from './wireAppLayoutVoiceAndRealtime';
import { wireAppLayoutMessagingAndProfiles } from './wireAppLayoutMessagingAndProfiles';

export function createAppLayoutController() {
  const phase1 = wireAppLayoutDmAndShell();
  const phase2 = wireAppLayoutVoiceAndRealtime(phase1);
  return wireAppLayoutMessagingAndProfiles(phase2);
}
