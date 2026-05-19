import type { EchoWorkspaceState } from '@/services/domain/workspaceEchoApiSnapshot';

/**
 * Voice presence (`voiceParticipantIds`, server mute/deaf maps) is ephemeral and must not
 * be restored from workspace caches — it survives server resets and shows ghosts (e.g. 4
 * users who are not in the room). Strip before persisting and after loading from
 * localStorage/sessionStorage.
 */
export function stripEphemeralVoiceFromWorkspaceSnapshot(
  state: EchoWorkspaceState,
): EchoWorkspaceState {
  const cbs = state.categoriesByServer;
  if (!cbs || typeof cbs !== 'object') return state;
  const nextCats: EchoWorkspaceState['categoriesByServer'] = {};
  for (const [sid, cats] of Object.entries(cbs)) {
    if (!Array.isArray(cats)) {
      nextCats[sid] = cats as EchoWorkspaceState['categoriesByServer'][string];
      continue;
    }
    nextCats[sid] = cats.map((cat) => {
      const channels = cat.channels;
      if (!Array.isArray(channels)) return cat;
      return {
        ...cat,
        channels: channels.map((chan) => {
          const c = chan as Record<string, unknown>;
          if (c.type !== 'voice') return chan;
          const copy = { ...c };
          delete copy.voiceParticipantIds;
          delete copy.voiceServerMuteByUserId;
          delete copy.voiceServerDeafenByUserId;
          return copy as typeof chan;
        }),
      };
    });
  }
  return { ...state, categoriesByServer: nextCats };
}
