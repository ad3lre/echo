import {
  postEchoDmLivekitSession,
  postEchoVoiceJoin,
  postEchoVoiceLeave,
  postEchoVoiceLivekitSession,
} from '@/api/echoClient';
import {
  jwtMetaForClientLog,
  voiceClientDiag,
  voiceClientTrace,
} from '@/observability/voiceClientTrace';
import { isEchoGraphId } from '@/utils/echoIds';
import { normalizeVoiceUserMessage } from '@/utils/voiceJoinUserMessage';
import { UIErrorBus } from '@/utils/uiErrorBus';

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
      e2eeMediaKey?: ArrayBuffer | null,
    ) => Promise<void>;
    disconnect: () => void;
  };
  /** Guild voice: resolve media key when channel has `voiceE2eeEnabled`. */
  getGuildVoiceE2eeMediaKey?: (
    serverId: string,
    channelId: string,
  ) => Promise<ArrayBuffer | null>;
  /** DM call: LibSignal-wrapped epoch flow when thread text E2EE is on. */
  getDmVoiceE2eeMediaKey?: (channelId: string) => Promise<ArrayBuffer | null>;
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
            let e2eeKey: ArrayBuffer | null = null;
            if (getGuildVoiceE2eeMediaKey) {
              try {
                e2eeKey = await getGuildVoiceE2eeMediaKey(serverId, channelId);
              } catch (e) {
                voiceClientTrace('voice.client:guild_e2ee_prepare_failed', {
                  err: e instanceof Error ? e.message : String(e),
                });
                throw e;
              }
            }
            const session = await postEchoVoiceLivekitSession(
              token,
              serverId,
              channelId,
            );
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
        let e2eeKey: ArrayBuffer | null = null;
        if (getDmVoiceE2eeMediaKey) {
          try {
            e2eeKey = await getDmVoiceE2eeMediaKey(channelId);
          } catch (prepErr) {
            voiceClientTrace('voice.client:dm_e2ee_prepare_failed', {
              err: prepErr instanceof Error ? prepErr.message : String(prepErr),
            });
            throw prepErr;
          }
        }
        let session = await postEchoDmLivekitSession(token, channelId);
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
            if (getDmVoiceE2eeMediaKey) {
              e2eeKey = await getDmVoiceE2eeMediaKey(channelId);
            }
            session = await postEchoDmLivekitSession(token, channelId);
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
            let e2eeKey: ArrayBuffer | null = null;
            if (getDmVoiceE2eeMediaKey) {
              e2eeKey = await getDmVoiceE2eeMediaKey(channelId);
            }
            const retrySession = await postEchoDmLivekitSession(
              token,
              channelId,
            );
            await liveKit.connect(
              retrySession.url,
              retrySession.token,
              null,
              e2eeKey,
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
