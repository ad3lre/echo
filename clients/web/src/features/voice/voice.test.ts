import { describe, it, expect, vi } from 'vitest';
import { createVoiceService } from '@/features/voice/voiceService';
import {
  postEchoDmLivekitSession,
  postEchoVoiceLivekitSession,
} from '@/api/echoClient';
import { EchoApiError } from '@/api/echo/transport';

vi.mock('@/api/echoClient', () => ({
  postEchoVoiceJoin: vi.fn(async () => {}),
  postEchoVoiceLeave: vi.fn(async () => {}),
  postEchoVoiceLivekitSession: vi.fn(),
  postEchoDmLivekitSession: vi.fn(),
}));

/** Valid Echo graph ids so join hits the REST path (no LiveKit in this test). */
const SERVER_ID = '550e8400-e29b-41d4-a716-446655440000';
const CHANNEL_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('voice orchestration', () => {
  it('calls routing service when joining and leaving after API join', async () => {
    const calls: string[] = [];
    const voiceRoutingService = {
      handleJoinVoice: (s: string, c: string) => calls.push(`join:${s}:${c}`),
      handleLeaveVoice: (s: string) => calls.push(`leave:${s}`),
    };
    const svc = createVoiceService({
      authSession: { isAuthenticated: true, accessToken: 'test-token' },
      workspace: {},
      workspaceHydrator: { hydrate: async () => {} },
      voiceRoutingService,
    });
    await svc.onJoinVoice(SERVER_ID, CHANNEL_ID);
    await svc.onLeaveVoice(SERVER_ID);
    expect(calls).toEqual([
      `join:${SERVER_ID}:${CHANNEL_ID}`,
      `leave:${SERVER_ID}`,
    ]);
  });

  it('disconnects LiveKit even when server id is empty (selection drift)', async () => {
    const disconnect = vi.fn();
    const voiceRoutingService = {
      handleJoinVoice: vi.fn(),
      handleLeaveVoice: vi.fn(),
    };
    const svc = createVoiceService({
      authSession: { isAuthenticated: true, accessToken: 'test-token' },
      workspace: {},
      workspaceHydrator: { hydrate: async () => {} },
      voiceRoutingService,
      liveKit: {
        connect: vi.fn(async () => {}),
        disconnect,
      },
    });
    await svc.onLeaveVoice('');
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(voiceRoutingService.handleLeaveVoice).toHaveBeenCalledWith(
      '',
      undefined,
      undefined,
    );
  });

  it('skips guild E2EE prepare for normal channels but forces it on backend E2EE retry', async () => {
    const connect = vi.fn(async () => {});
    const prepareCalls: Array<boolean | undefined> = [];
    const getGuildVoiceE2eeMediaKey = vi.fn(
      async (_s: string, _c: string, forceE2ee?: boolean) => {
        prepareCalls.push(forceE2ee);
        return { mediaKey: null, senderDeviceId: '' };
      },
    );

    vi.mocked(postEchoVoiceLivekitSession)
      .mockRejectedValueOnce(
        new EchoApiError(409, {
          code: 'VOICE_E2EE_EPOCH_REQUIRED',
          message: 'Voice E2EE epoch required',
        }),
      )
      .mockResolvedValueOnce({
        url: 'wss://example.livekit.invalid',
        token: 'token',
        roomName: 'echo_realm:test',
        bitrateBps: null,
        voiceE2ee: { required: true, epochId: null },
      });

    const svc = createVoiceService({
      authSession: { isAuthenticated: true, accessToken: 'test-token' },
      workspace: {},
      workspaceHydrator: { hydrate: async () => {} },
      liveKit: { connect, disconnect: vi.fn() },
      getGuildVoiceE2eeMediaKey,
    });

    // The mocked retry resolves with a session whose voiceE2ee.required is true
    // but no real key (prepare returns null here); we only assert the gate flag
    // threading, so swallow the resulting "requires E2EE" guard error.
    await expect(svc.onJoinVoice(SERVER_ID, CHANNEL_ID)).rejects.toThrow();

    // First call must NOT force E2EE (normal-channel fast path); the
    // backend-driven retry must force it.
    expect(prepareCalls).toEqual([undefined, true]);
    expect(postEchoVoiceLivekitSession).toHaveBeenCalledTimes(2);
  });

  it('retries DM LiveKit join once after membership-style forbidden', async () => {
    const hydrate = vi.fn(async () => {});
    const connect = vi.fn(async () => {});
    vi.mocked(postEchoDmLivekitSession)
      .mockRejectedValueOnce(
        new Error('FORBIDDEN (You cannot join a call in this conversation.)'),
      )
      .mockResolvedValueOnce({
        url: 'wss://example.livekit.invalid',
        token: 'token',
        roomName: 'echo_dm_realm:test',
        bitrateBps: null,
      });

    const svc = createVoiceService({
      authSession: { isAuthenticated: true, accessToken: 'test-token' },
      workspace: {},
      workspaceHydrator: { hydrate },
      liveKit: {
        connect,
        disconnect: vi.fn(),
      },
    });

    await svc.onJoinDmVoice(CHANNEL_ID);

    expect(postEchoDmLivekitSession).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledTimes(2);
  });
});
