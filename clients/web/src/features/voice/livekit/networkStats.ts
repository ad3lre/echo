import type { Room as LKRoom } from 'livekit-client';
import { voiceClientDiag } from '@/observability/voiceClientTrace';
import {
  getRtcStatsReportIfSupported,
  getSenderStatsIfSupported,
  parseOutboundVideoRtpStats,
  parseRtcStatsReport,
  type SenderStatsLike,
} from '@/features/voice/livekit/livekitTrackAdapter';
import {
  LK_SOURCE_CAMERA,
  LK_SOURCE_SCREEN_SHARE,
} from '@/features/voice/livekit/livekitTrackDuckTypes';
import { STATS_FAILURE_LOG_MAX } from '@/features/voice/livekit/livekitVoiceRoomHelpers';
import type { LiveKitNetworkStats } from '@/features/voice/livekitVoiceRoom.types';
import type { LiveKitVoiceSessionContext } from '@/features/voice/livekit/context';

export function createNetworkStatsController(ctx: LiveKitVoiceSessionContext) {
  const { lkRoom, roomState, networkStats, opts } = ctx;
  const onNetworkStatsSample = opts.onNetworkStatsSample;

  let statsInterval: ReturnType<typeof setInterval> | null = null;
  let prevBytesSent = 0;
  let prevTimestamp = 0;
  let statsSuccessLogged = false;
  let statsFailureLogs = 0;
  let statsTickInFlight = false;

  function buildStatsFromSenderStats(
    stats: SenderStatsLike,
  ): LiveKitNetworkStats {
    let bitrateKbps = 0;
    if (stats.bytesSent != null && stats.timestamp) {
      if (prevTimestamp > 0) {
        const dtSec = (stats.timestamp - prevTimestamp) / 1000;
        if (dtSec > 0) {
          bitrateKbps = ((stats.bytesSent - prevBytesSent) * 8) / dtSec / 1000;
        }
      }
      prevBytesSent = stats.bytesSent;
      prevTimestamp = stats.timestamp;
    }

    const rtt = stats.roundTripTime ?? 0;
    const jitter = stats.jitter ?? 0;
    const lost = stats.packetsLost ?? 0;
    const sent = stats.packetsSent ?? 0;
    const lossPct = sent + lost > 0 ? (lost / (sent + lost)) * 100 : 0;

    return {
      latencyMs: rtt * 1000,
      jitterMs: jitter * 1000,
      packetLossPct: lossPct,
      bitrateKbps: Math.max(0, bitrateKbps),
      codec: 'Opus',
    };
  }

  async function sampleNetworkStatsTick(room: LKRoom): Promise<boolean> {
    const lp = room.localParticipant;
    let gotStatsThisTick = false;

    for (const pub of lp.audioTrackPublications.values()) {
      const track = pub.track;
      if (!track) continue;

      const report = await getRtcStatsReportIfSupported(track);
      if (report && typeof report.forEach === 'function') {
        let nextBytes = prevBytesSent;
        let nextTs = prevTimestamp;
        report.forEach((s: RTCStats) => {
          const st = s as unknown as Record<string, unknown>;
          if (
            String(st.type) === 'outbound-rtp' &&
            (st.kind === 'audio' || st.mediaType === 'audio')
          ) {
            if (typeof st.bytesSent === 'number') nextBytes = st.bytesSent;
            if (typeof st.timestamp === 'number') nextTs = st.timestamp;
          }
        });
        const parsed = parseRtcStatsReport(
          report as RTCStatsReport,
          prevBytesSent,
          prevTimestamp,
        );
        prevBytesSent = nextBytes;
        prevTimestamp = nextTs;

        networkStats.value = {
          latencyMs: parsed.latencyMs,
          jitterMs: parsed.jitterMs,
          packetLossPct: parsed.packetLossPct,
          bitrateKbps: parsed.bitrateKbps,
          codec: parsed.codec,
        };
        gotStatsThisTick = true;
        if (!statsSuccessLogged) {
          statsSuccessLogged = true;
          voiceClientDiag('info', 'voice.client:stats_first_ok', {
            path: 'getRTCStatsReport',
            stats: networkStats.value,
          });
        }
        break;
      }

      const senderStats = await getSenderStatsIfSupported(track);
      if (senderStats) {
        networkStats.value = buildStatsFromSenderStats(senderStats);
        gotStatsThisTick = true;
        if (!statsSuccessLogged) {
          statsSuccessLogged = true;
          voiceClientDiag('info', 'voice.client:stats_first_ok', {
            path: 'getSenderStats',
            stats: networkStats.value,
          });
        }
        break;
      }
    }

    if (gotStatsThisTick && networkStats.value) {
      const screenPub = lp.getTrackPublication(LK_SOURCE_SCREEN_SHARE);
      const camPub = lp.getTrackPublication(LK_SOURCE_CAMERA);
      const vPub = screenPub?.track ? screenPub : camPub;
      const vt = vPub?.track;
      if (vt) {
        const vr = await getRtcStatsReportIfSupported(vt);
        if (vr) {
          networkStats.value = {
            ...networkStats.value,
            ...parseOutboundVideoRtpStats(vr),
          };
        }
      }
    }

    if (!gotStatsThisTick && statsFailureLogs < STATS_FAILURE_LOG_MAX) {
      statsFailureLogs += 1;
      voiceClientDiag('warn', 'voice.client:stats_sample_failed', {
        attempt: statsFailureLogs,
        max: STATS_FAILURE_LOG_MAX,
      });
    }
    if (gotStatsThisTick && networkStats.value && onNetworkStatsSample) {
      onNetworkStatsSample(networkStats.value);
    }
    return gotStatsThisTick;
  }

  function startStatsPolling() {
    stopStatsPolling();
    prevBytesSent = 0;
    prevTimestamp = 0;
    statsSuccessLogged = false;
    statsFailureLogs = 0;

    statsInterval = setInterval(() => {
      const room = lkRoom.value;
      if (!room || roomState.value !== 'connected') return;
      if (statsTickInFlight) return;
      statsTickInFlight = true;
      void (async () => {
        try {
          await sampleNetworkStatsTick(room);
        } catch (e) {
          if (statsFailureLogs < STATS_FAILURE_LOG_MAX) {
            statsFailureLogs += 1;
            voiceClientDiag('warn', 'voice.client:stats_tick_error', {
              attempt: statsFailureLogs,
              max: STATS_FAILURE_LOG_MAX,
              err: e instanceof Error ? e.message : String(e),
            });
          }
        } finally {
          statsTickInFlight = false;
        }
      })();
    }, 2000);
  }

  function stopStatsPolling() {
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
    networkStats.value = null;
  }

  return {
    startStatsPolling,
    stopStatsPolling,
  };
}

export type NetworkStatsController = ReturnType<
  typeof createNetworkStatsController
>;
