import type { Room as LKRoom } from 'livekit-client';
import {
  encodeEchoVcData,
  encodeEchoVcPrivateViewer,
  type EchoVcDataV1,
  type EchoVcPrivateViewerV1,
} from '@/audio/voiceEchoLiveKitData';
import { announceVoiceChannelPublic } from '@/composables/useEchoSounds';

function publishVcPublicMedia(room: LKRoom, msg: EchoVcDataV1) {
  void room.localParticipant.publishData(
    Uint8Array.from(encodeEchoVcData(msg)),
    {
      reliable: true,
    },
  );
}

function localIdentityPayload(
  room: LKRoom,
  kind: EchoVcDataV1['kind'],
): EchoVcDataV1 {
  const uid = room.localParticipant.identity;
  const name = room.localParticipant.name?.trim() || undefined;
  return { v: 1, t: 'public_media', kind, userId: uid, name };
}

export function createVcAnnouncements() {
  function notifyStreamerViewerLeftStream(
    room: LKRoom,
    streamerIdentity: string,
  ) {
    if (
      !streamerIdentity ||
      streamerIdentity === room.localParticipant.identity
    ) {
      return;
    }
    const payload: EchoVcPrivateViewerV1 = {
      v: 1,
      t: 'viewer_stream',
      kind: 'viewer_left_stream',
      viewerId: room.localParticipant.identity,
    };
    void room.localParticipant.publishData(
      Uint8Array.from(encodeEchoVcPrivateViewer(payload)),
      {
        reliable: true,
        destinationIdentities: [streamerIdentity],
      },
    );
  }

  function announceLocalVcPublic(room: LKRoom, kind: EchoVcDataV1['kind']) {
    publishVcPublicMedia(room, localIdentityPayload(room, kind));
    switch (kind) {
      case 'stream_start':
        announceVoiceChannelPublic({
          title: 'You started streaming',
          sound: 'streamStart',
        });
        break;
      case 'stream_end':
        announceVoiceChannelPublic({
          title: 'You stopped streaming',
          sound: 'streamEnd',
        });
        break;
      case 'video_start':
        announceVoiceChannelPublic({
          title: 'You turned on your camera',
          sound: 'videoStart',
        });
        break;
      case 'video_end':
        announceVoiceChannelPublic({
          title: 'You turned off your camera',
          sound: 'videoEnd',
        });
        break;
    }
  }

  return { announceLocalVcPublic, notifyStreamerViewerLeftStream };
}

export type VcAnnouncements = ReturnType<typeof createVcAnnouncements>;
