export type DmCallGlassPeer = {
  isGroup: boolean;
  id: string;
  name: string;
  pfp: string;
  status?: string;
};

/**
 * Surface-scoped DM call state: present only for the exact DM thread that owns
 * the active call. All DM call header/body chrome should flow from this single
 * selector rather than re-matching global call flags in view components.
 */
export type ActiveDmThreadCallUi = {
  threadId: string;
  targetId: string;
  isGroup: boolean;
  /** Persisted thread-level call presence from hydrate; visible affordance only until user joins. */
  visualOnly?: boolean;
  quarterView: boolean;
  fullscreen: boolean;
  ringing: boolean;
  awaitingAccept: boolean;
  ringUi: boolean;
  lobbyAfterSelfLeave: boolean;
  incoming: boolean;
  ringRemoteVanishing: boolean;
  glassPeer: DmCallGlassPeer | null;
  /** True when DM/group voice uses LiveKit E2EE (default for calls). */
  voiceE2ee: boolean;
};
