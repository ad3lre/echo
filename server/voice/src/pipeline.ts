import { voiceSidecarPipelineTickTotal } from './metrics';
import type {
  AppliedRoomControl,
  LiveKitWebhookEnvelope,
  RoomSnapshot,
} from './types';
import { StateBuilder } from './jobs/stateBuilder';
import { evaluatePolicy } from './jobs/policyEvaluator';
import { applyDiff, computeDiff } from './jobs/diffEmitter';

export class VoiceIntelligencePipeline {
  private readonly state = new StateBuilder();
  private readonly lastAppliedByRoom = new Map<string, AppliedRoomControl>();

  ingestLiveKitWebhook(envelope: LiveKitWebhookEnvelope): RoomSnapshot | null {
    const snapshot = this.state.ingestLiveKitWebhook(envelope);
    if (!snapshot) return null;

    voiceSidecarPipelineTickTotal.inc({ reason: 'livekit_webhook' });

    const desired = evaluatePolicy(snapshot);
    const lastApplied = this.lastAppliedByRoom.get(snapshot.roomName) ?? null;
    const diff = computeDiff({ desired, lastApplied });
    const applied = applyDiff(diff);
    this.lastAppliedByRoom.set(snapshot.roomName, applied);

    return snapshot;
  }
}
