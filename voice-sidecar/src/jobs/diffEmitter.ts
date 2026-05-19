import type {
  AppliedRoomControl,
  ControlDiff,
  DesiredRoomControl,
} from '../types';

/**
 * Layer 2 job #3: desired vs lastApplied -> minimal diff.
 * This is intentionally a stub: Layer 1 already exposes LiveKit adapter surfaces in Echo backend;
 * this sidecar will later call a dedicated adapter service on the voice node.
 */
export function computeDiff(opts: {
  desired: DesiredRoomControl;
  lastApplied: AppliedRoomControl | null;
}): ControlDiff {
  const roomName = opts.desired.roomName;
  void opts.lastApplied;
  return { roomName, mutations: [] };
}

export function applyDiff(_diff: ControlDiff): AppliedRoomControl {
  return { roomName: _diff.roomName, appliedAtMs: Date.now() };
}
