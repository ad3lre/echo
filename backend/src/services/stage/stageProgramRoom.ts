import type { Pool } from 'pg';
import { getEchoChannelType } from '../../domain/echoStore/voice';
import {
  liveKitRoomName,
  updateLiveKitRoomMetadata,
} from '../livekit/livekitAdapter';

export type EchoStageProgramRoomMetadata = {
  echoStageProgram: {
    speakerIds: string[];
    /** LiveKit participant identity; optional program pin from moderators. */
    pinnedIdentity?: string | null;
    layout?: string | null;
  };
};

export async function listStageSpeakerUserIds(
  pool: Pool,
  serverId: string,
  channelId: string,
): Promise<string[]> {
  const r = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM echo_voice_participants
     WHERE server_id = $1 AND channel_id = $2 AND stage_speaker = TRUE`,
    [serverId, channelId],
  );
  return r.rows.map((row) => String(row.user_id));
}

export function buildStageProgramRoomMetadata(input: {
  speakerIds: string[];
  pinnedIdentity?: string | null;
  layout?: string | null;
}): string {
  const payload: EchoStageProgramRoomMetadata = {
    echoStageProgram: {
      speakerIds: input.speakerIds,
      pinnedIdentity: input.pinnedIdentity ?? null,
      layout: input.layout ?? null,
    },
  };
  return JSON.stringify(payload);
}

/** Pushes stage speaker roster into LiveKit room metadata for egress program templates. */
export async function syncStageProgramRoomMetadata(
  pool: Pool,
  serverId: string,
  channelId: string,
  extras?: { pinnedIdentity?: string | null; layout?: string | null },
): Promise<void> {
  const channelType = await getEchoChannelType(pool, serverId, channelId);
  if (channelType !== 'stage') return;
  const speakerIds = await listStageSpeakerUserIds(pool, serverId, channelId);
  const metadata = buildStageProgramRoomMetadata({
    speakerIds,
    pinnedIdentity: extras?.pinnedIdentity,
    layout: extras?.layout,
  });
  await updateLiveKitRoomMetadata(
    liveKitRoomName(serverId, channelId),
    metadata,
  );
}
