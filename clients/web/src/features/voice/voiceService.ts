import {
  postEchoDmLivekitSession,
  postEchoVoiceJoin,
  postEchoVoiceLeave,
  postEchoVoiceLivekitSession,
} from '@/api/echoClient';
import { EchoApiError } from '@/api/echo/transport';
import type { EchoLiveKitSessionResponse } from '@/api/echo/voice';
import type { LiveKitVoiceConnectOptions } from '@/features/voice/livekitVoiceRoom.types';
import {
  jwtMetaForClientLog,
  voiceClientDiag,
  voiceClientTrace,
} from '@/observability/voiceClientTrace';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';
import { normalizeVoiceUserMessage } from '@/features/layout/failures/voiceJoinUserMessage';
import { UIErrorBus } from '@/features/layout/failures/uiErrorBus';
import type { VoiceE2eePrepareResult } from '@/features/voice/voiceE2eePrepare';

type VoiceE2eePrepareFnResult = VoiceE2eePrepareResult | ArrayBuffer | null;

/** What `liveKit.connect` accepts: v1 raw key, v2 MLS {key, index, senderKeys}, or none. */
export type VoiceConnectE2eeInput =
  | ArrayBuffer
  | {
      initialKey: ArrayBuffer;
      keyIndex: number;
      senderKeys?: ReadonlyMap<string, ArrayBuffer>;
    }
  | null;

function normalizeVoiceE2eePrepare(
  raw: VoiceE2eePrepareFnResult,
): VoiceE2eePrepareResult {
  if (raw == null) return { mediaKey: null, senderDeviceId: '' };
  if (raw instanceof ArrayBuffer) {
    return { mediaKey: raw, senderDeviceId: '' };
  }
  return raw;
}

/**
 * Idempotent REST join so guild E2EE epoch creation sees the actor in
 * `echo_voice_participants` before LiveKit session mint (see layout prepare hook).
 */
export async function ensureGuildVoiceParticipantRow(
  token: string,
  serverId: string,
  channelId: string,
): Promise<void> {
  await postEchoVoiceJoin(token, serverId, channelId);
}

/** Build the connect input: v2 carries a keyIndex for in-band rotation. */
function toConnectE2eeInput(p: VoiceE2eePrepareResult): VoiceConnectE2eeInput {
  if (!p.mediaKey) return null;
  if (typeof p.keyIndex === 'number') {
    return {
      initialKey: p.mediaKey,
      keyIndex: p.keyIndex,
      senderKeys: p.senderKeys,
    };
  }
  return p.mediaKey;
}

export type VoiceServiceDeps = {
  authSession: {
    isAuthenticated: boolean;
    accessToken?: string | null | undefined;
  };
  workspace: unknown;
  workspaceHydrator?: { hydrate: () => Promise<void> };
  voiceRoutingService?: {
    handleJoinVoice?: (
      serverId: string,
      channelId: string,
      arg?: unknown,
    ) => void;
    handleLeaveVoice?: (serverId: string, a?: unknown, b?: unknown) => void;
  };
  liveKit?: {
    connect: (
      url: string,
      token: string,
      bitrateBps?: number | null,
      e2eeMediaKey?: VoiceConnectE2eeInput,
      options?: LiveKitVoiceConnectOptions,
    ) => Promise<void>;
    disconnect: () => void;
  };
  /**
   * Guild voice: create/fetch LibSignal-wrapped media key before LiveKit session.
   * Returns null key material for non-E2EE channels so normal voice never runs
   * the E2EE/MLS machinery. `forceE2ee` is set on the backend-driven retry (the
   * server reported the channel requires E2EE) to bypass that client-side gate
   * when the cached channel flag is stale.
   */
  getGuildVoiceE2eeMediaKey?: (
    serverId: string,
    channelId: string,
    forceE2ee?: boolean,
  ) => Promise<VoiceE2eePrepareFnResult>;
  /** DM call: LibSignal-wrapped media key epoch (voice E2EE, always on). */
  getDmVoiceE2eeMediaKey?: (
    channelId: string,
  ) => Promise<VoiceE2eePrepareFnResult>;
};

export function createVoiceService({
  authSession,
  workspace: _workspace,
  workspaceHydrator,
  voiceRoutingService,
  liveKit,
  getGuildVoiceE2eeMediaKey,
  getDmVoiceE2eeMediaKey,
}: VoiceServiceDeps) {
  function shouldRetryDmVoiceJoin(raw: string): boolean {
    const lower = raw.trim().toLowerCase();
    if (!lower) return false;
    return (
      lower.includes('forbidden') ||
      lower.includes('not a member of this group') ||
      lower.includes('cannot join a call in this conversation')
    );
  }

  async function mintGuildLiveKitSession(
    token: string,
    serverId: string,
    channelId: string,
    e2eePrepare?: (
      serverId: string,
      channelId: string,
      forceE2ee?: boolean,
    ) => Promise<VoiceE2eePrepareFnResult>,
  ): Promise<{
    session: EchoLiveKitSessionResponse;
    e2eeKey: VoiceConnectE2eeInput;
  }> {
    let prepared = normalizeVoiceE2eePrepare(null);
    if (e2eePrepare) {
      prepared = normalizeVoiceE2eePrepare(
        await e2eePrepare(serverId, channelId),
      );
    }
    const sessionOpts = prepared.senderDeviceId
      ? { e2eeDeviceId: prepared.senderDeviceId }
      : undefined;
    try {
      const session = await postEchoVoiceLivekitSession(
        token,
        serverId,
        channelId,
        sessionOpts,
      );
      return { session, e2eeKey: toConnectE2eeInput(prepared) };
    } catch (e) {
      if (
        e instanceof EchoApiError &&
        e.status === 409 &&
        (e.body.code === 'VOICE_E2EE_EPOCH_REQUIRED' ||
          e.body.code === 'VOICE_E2EE_ENVELOPE_MISSING') &&
        e2eePrepare
      ) {
        voiceClientTrace('voice.client:guild_e2ee_epoch_retry', {
          serverId,
          channelId,
          code: e.body.code,
        });
        prepared = normalizeVoiceE2eePrepare(
          await e2eePrepare(serverId, channelId, true),
        );
        const retryOpts = prepared.senderDeviceId
          ? { e2eeDeviceId: prepared.senderDeviceId }
          : undefined;
        const session = await postEchoVoiceLivekitSession(
          token,
          serverId,
          channelId,
          retryOpts,
        );
        return { session, e2eeKey: toConnectE2eeInput(prepared) };
      }
      throw e;
    }
  }

  async function mintDmLiveKitSession(
    token: string,
    channelId: string,
    e2eePrepare?: (channelId: string) => Promise<VoiceE2eePrepareFnResult>,
  ): Promise<{
    session: EchoLiveKitSessionResponse;
    e2eeKey: VoiceConnectE2eeInput;
  }> {
    let prepared = normalizeVoiceE2eePrepare(null);
    if (e2eePrepare) {
      prepared = normalizeVoiceE2eePrepare(await e2eePrepare(channelId));
    }
    const sessionOpts = prepared.senderDeviceId
      ? { e2eeDeviceId: prepared.senderDeviceId }
      : undefined;
    try {
      const session = await postEchoDmLivekitSession(
        token,
        channelId,
        sessionOpts,
      );
      return { session, e2eeKey: toConnectE2eeInput(prepared) };
    } catch (e) {
      if (
        e instanceof EchoApiError &&
        e.status === 409 &&
        (e.body.code === 'VOICE_E2EE_EPOCH_REQUIRED' ||
          e.body.code === 'VOICE_E2EE_ENVELOPE_MISSING') &&
        e2eePrepare
      ) {
        voiceClientTrace('voice.client:dm_e2ee_epoch_retry', {
          channelId,
          code: e.body.code,
        });
        prepared = normalizeVoiceE2eePrepare(await e2eePrepare(channelId));
        const retryOpts = prepared.senderDeviceId
          ? { e2eeDeviceId: prepared.senderDeviceId }
          : undefined;
        const session = await postEchoDmLivekitSession(
          token,
          channelId,
          retryOpts,
        );
        return { session, e2eeKey: toConnectE2eeInput(prepared) };
      }
      throw e;
    }
  }

  return {
    async onJoinVoice(serverId: string, channelId: string) {
      const token = authSession.accessToken ?? '';
      voiceClientTrace('voice.client:onJoinVoice', {
        serverId,
        channelId,
        mock: false,
        hasLiveKit: !!liveKit,
        authenticated: authSession.isAuthenticated,
        serverIdLooksEcho: !!(serverId && isEchoGraphId(serverId)),
      });
      voiceClientDiag('info', 'voice.service:onJoinVoice', {
        serverId,
        channelId,
        mock: false,
        hasLiveKit: !!liveKit,
        authenticated: authSession.isAuthenticated,
      });

      if (authSession.isAuthenticated && serverId && isEchoGraphId(serverId)) {
        try {
          if (liveKit) {
            voiceClientTrace('voice.client:livekit_session_request', {
              serverId,
              channelId,
            });
            voiceClientDiag('info', 'voice.service:livekit_session_request', {
              serverId,
              channelId,
            });
            let session: EchoLiveKitSessionResponse;
            let e2eeKey: VoiceConnectE2eeInput = null;
            try {
              const minted = await mintGuildLiveKitSession(
                token,
                serverId,
                channelId,
                getGuildVoiceE2eeMediaKey,
              );
              session = minted.session;
              e2eeKey = minted.e2eeKey;
            } catch (e) {
              voiceClientTrace('voice.client:guild_e2ee_prepare_failed', {
                err: e instanceof Error ? e.message : String(e),
              });
              throw e;
            }
            if (session.voiceE2ee?.required && !e2eeKey) {
              throw new Error(
                'This voice channel requires end-to-end encryption. Could not obtain key material.',
              );
            }
            voiceClientTrace('voice.client:livekit_session_ok', {
              roomName: session.roomName,
              urlScheme: session.url.startsWith('wss')
                ? 'wss'
                : session.url.startsWith('ws')
                  ? 'ws'
                  : 'other',
              ...jwtMetaForClientLog(session.token),
            });
            voiceClientDiag('info', 'voice.service:livekit_session_ok', {
              roomName: session.roomName,
              urlHost: (() => {
                try {
                  return new URL(session.url).host;
                } catch {
                  return 'invalid';
                }
              })(),
            });
            await liveKit.connect(
              session.url,
              session.token,
              session.bitrateBps,
              e2eeKey,
            );
            voiceClientTrace('voice.client:livekit_connect_returned', {
              roomName: session.roomName,
            });
          } else {
            voiceClientTrace('voice.client:rest_join_only', {
              serverId,
              channelId,
            });
            voiceClientDiag('info', 'voice.service:rest_join_only', {
              serverId,
              channelId,
            });
            await postEchoVoiceJoin(token, serverId, channelId);
          }
          if (workspaceHydrator) await workspaceHydrator.hydrate();
        } catch (e) {
          voiceClientTrace('voice.client:onJoinVoice_error', {
            err: e instanceof Error ? e.message : String(e),
          });
          voiceClientDiag('error', 'voice.service:onJoinVoice_failed', {
            err: e instanceof Error ? e.message : String(e),
          });
          throw e;
        }
      } else {
        voiceClientTrace('voice.client:onJoinVoice_skip_api', {
          mock: false,
          authenticated: authSession.isAuthenticated,
        });
        voiceClientDiag('info', 'voice.service:onJoinVoice_skip_api', {
          mock: false,
          authenticated: authSession.isAuthenticated,
        });
        if (!authSession.isAuthenticated) {
          const err = new Error('Sign in to use voice channels.');
          UIErrorBus.emit({
            context: 'voice.join',
            severity: 'warning',
            userMessage: err.message,
          });
          throw err;
        }
        if (!serverId || !isEchoGraphId(serverId)) {
          const err = new Error('Voice is unavailable for this server.');
          UIErrorBus.emit({
            context: 'voice.join',
            severity: 'warning',
            userMessage: err.message,
          });
          throw err;
        }
      }
      voiceRoutingService?.handleJoinVoice?.(serverId, channelId, undefined);
    },

    /** 1:1 or group DM call — mints `echo_dm_realm:<channelId>` room; same LiveKit client as guild VC. */
    async onJoinDmVoice(channelId: string) {
      const token = authSession.accessToken ?? '';
      voiceClientTrace('voice.client:onJoinDmVoice', {
        channelId,
        hasLiveKit: !!liveKit,
      });
      if (!authSession.isAuthenticated || !isEchoGraphId(channelId)) {
        const err = new Error('Sign in to start a call in this chat.');
        UIErrorBus.emit({
          context: 'voice.dm_join',
          severity: 'warning',
          userMessage: err.message,
        });
        throw err;
      }
      if (!liveKit) {
        const err = new Error('Voice is not available in this build.');
        UIErrorBus.emit({
          context: 'voice.dm_join',
          severity: 'warning',
          userMessage: err.message,
        });
        throw err;
      }
      let attemptedRecoveryRefresh = false;
      try {
        let session: EchoLiveKitSessionResponse;
        let e2eeKey: VoiceConnectE2eeInput = null;
        try {
          const minted = await mintDmLiveKitSession(
            token,
            channelId,
            getDmVoiceE2eeMediaKey,
          );
          session = minted.session;
          e2eeKey = minted.e2eeKey;
        } catch (prepErr) {
          voiceClientTrace('voice.client:dm_e2ee_prepare_failed', {
            err: prepErr instanceof Error ? prepErr.message : String(prepErr),
          });
          throw prepErr;
        }
        if (session.voiceE2ee?.required && !e2eeKey) {
          throw new Error(
            'This call requires end-to-end encryption. Could not obtain key material.',
          );
        }
        voiceClientTrace('voice.client:dm_livekit_session_ok', {
          roomName: session.roomName,
          ...jwtMetaForClientLog(session.token),
        });
        try {
          await liveKit.connect(session.url, session.token, null, e2eeKey);
        } catch (connectErr) {
          const msg =
            connectErr instanceof Error
              ? connectErr.message
              : String(connectErr);
          if (
            !attemptedRecoveryRefresh &&
            workspaceHydrator &&
            shouldRetryDmVoiceJoin(msg)
          ) {
            attemptedRecoveryRefresh = true;
            voiceClientTrace('voice.client:onJoinDmVoice_retry_after_hydrate', {
              channelId,
              stage: 'connect',
            });
            await workspaceHydrator.hydrate();
            const minted = await mintDmLiveKitSession(
              token,
              channelId,
              getDmVoiceE2eeMediaKey,
            );
            session = minted.session;
            e2eeKey = minted.e2eeKey;
            await liveKit.connect(session.url, session.token, null, e2eeKey);
          } else {
            throw connectErr;
          }
        }
        if (workspaceHydrator) await workspaceHydrator.hydrate();
      } catch (e) {
        let finalErr: unknown = e;
        const msg =
          finalErr instanceof Error ? finalErr.message : String(finalErr);
        if (
          !attemptedRecoveryRefresh &&
          workspaceHydrator &&
          shouldRetryDmVoiceJoin(msg)
        ) {
          voiceClientTrace('voice.client:onJoinDmVoice_retry_after_hydrate', {
            channelId,
            stage: 'session',
          });
          try {
            await workspaceHydrator.hydrate();
            const minted = await mintDmLiveKitSession(
              token,
              channelId,
              getDmVoiceE2eeMediaKey,
            );
            await liveKit.connect(
              minted.session.url,
              minted.session.token,
              null,
              minted.e2eeKey,
            );
            await workspaceHydrator.hydrate();
            return;
          } catch (retryErr) {
            voiceClientTrace('voice.client:onJoinDmVoice_retry_failed', {
              err:
                retryErr instanceof Error ? retryErr.message : String(retryErr),
            });
            finalErr = retryErr;
          }
        }
        voiceClientTrace('voice.client:onJoinDmVoice_error', {
          err: finalErr instanceof Error ? finalErr.message : String(finalErr),
        });
        const finalMsg =
          finalErr instanceof Error ? finalErr.message : String(finalErr);
        UIErrorBus.emit({
          context: 'voice.dm_join',
          severity: 'error',
          userMessage:
            normalizeVoiceUserMessage(finalMsg) ||
            'Could not start the call. Check your network and try again.',
        });
        throw finalErr;
      }
    },

    async onLeaveDmVoice() {
      voiceClientTrace('voice.client:onLeaveDmVoice', {
        hasLiveKit: !!liveKit,
      });
      liveKit?.disconnect();
      if (workspaceHydrator) await workspaceHydrator.hydrate();
    },

    async onLeaveVoice(serverId: string) {
      const token = authSession.accessToken ?? '';
      voiceClientTrace('voice.client:onLeaveVoice', {
        serverId,
        mock: false,
        hasLiveKit: !!liveKit,
      });
      voiceClientDiag('info', 'voice.service:onLeaveVoice', {
        serverId,
        mock: false,
        hasLiveKit: !!liveKit,
      });

      /**
       * Always drop the local LiveKit session on guild leave, even when `serverId`
       * is missing or invalid (e.g. user switched to DM rail so selection no longer
       * matches the VC guild). Otherwise the UI clears while audio stays connected.
       */
      voiceClientTrace('voice.client:livekit_disconnect_before_api', {});
      liveKit?.disconnect();

      if (authSession.isAuthenticated && serverId && isEchoGraphId(serverId)) {
        try {
          await postEchoVoiceLeave(token, serverId);
          voiceClientTrace('voice.client:leave_api_ok', { serverId });
          if (workspaceHydrator) await workspaceHydrator.hydrate();
        } catch (e) {
          voiceClientTrace('voice.client:onLeaveVoice_error', {
            err: e instanceof Error ? e.message : String(e),
          });
          voiceClientDiag('error', 'voice.service:onLeaveVoice_failed', {
            err: e instanceof Error ? e.message : String(e),
          });
          const msg = e instanceof Error ? e.message : String(e);
          UIErrorBus.emit({
            context: 'voice.leave',
            severity: 'error',
            userMessage: msg || 'Could not leave the voice channel.',
          });
        }
      }
      voiceRoutingService?.handleLeaveVoice?.(serverId, undefined, undefined);
    },
  };
}
