import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'echo_' });

export const echoSocketBranchTotal = new Counter({
  name: 'echo_socket_message_branch_total',
  help: 'Socket message handler branch (echo_persisted, reject_unknown)',
  labelNames: ['branch'],
  registers: [registry],
});

export const echoMessageFailedTotal = new Counter({
  name: 'echo_message_failed_total',
  help: 'message_failed emissions by code',
  labelNames: ['code'],
  registers: [registry],
});

export const echoSocketOpEnvelopeDisconnectsTotal = new Counter({
  name: 'echo_socket_op_envelope_disconnects_total',
  help: 'Connections ejected by the per-connection global inbound op envelope',
  registers: [registry],
});

export type EchoChannelMetaCacheOutcome = 'hit' | 'miss';

export const echoChannelMetaCacheTotal = new Counter({
  name: 'echo_channel_meta_cache_total',
  help: 'Channel-metadata cache outcomes on the send path (hit vs db miss)',
  labelNames: ['outcome'],
  registers: [registry],
});

export type EchoUnfurlCacheOutcome = 'hit' | 'coalesced' | 'miss';

export const echoUnfurlCacheTotal = new Counter({
  name: 'echo_unfurl_cache_total',
  help: 'Link unfurl cache outcomes (hit, coalesced in-flight, miss)',
  labelNames: ['outcome'],
  registers: [registry],
});

export const echoMessagesPersistedTotal = new Counter({
  name: 'echo_messages_persisted_total',
  help: 'Echo messages inserted vs duplicate idempotent',
  labelNames: ['result'],
  registers: [registry],
});

export const echoSocketHandlerDurationSeconds = new Histogram({
  name: 'echo_socket_message_handler_duration_seconds',
  help: 'Time spent in async message handler',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [registry],
});

export const echoWorkspaceEventPublishedTotal = new Counter({
  name: 'echo_workspace_event_published_total',
  help: 'Versioned Echo workspace/state events published to clients',
  labelNames: ['kind'],
  registers: [registry],
});

export const echoWorkspaceSnapshotRejectedTotal = new Counter({
  name: 'echo_workspace_snapshot_rejected_total',
  help: 'Workspace snapshots rejected as stale on the client/server contract boundary',
  labelNames: ['reason'],
  registers: [registry],
});

export const echoPermissionDenialReasonTotal = new Counter({
  name: 'echo_permission_denial_reason_total',
  help: 'Permission denials by diagnosed reason',
  labelNames: ['reason'],
  registers: [registry],
});

/** ADR 002: generator blocked until next millisecond (sequence bucket or clock catch-up). */
export const echoSnowflakeGeneratorWaitNextMsTotal = new Counter({
  name: 'echo_snowflake_generator_wait_next_ms_total',
  help: 'Snowflake generator waited for next millisecond',
  registers: [registry],
});

/** ADR 002: sequence slot used at emit (0–4095); high values warn before blocking. */
export const echoSnowflakeGeneratorSequenceObserved = new Histogram({
  name: 'echo_snowflake_generator_sequence_observed',
  help: 'Sequence value observed when emitting a snowflake id',
  buckets: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4095],
  registers: [registry],
});

/** Message search (REST) — duration and hit counts for ops dashboards. */
export const echoMessageSearchDurationSeconds = new Histogram({
  name: 'echo_message_search_duration_seconds',
  help: 'Echo GET …/messages/search wall time',
  labelNames: ['scope'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const echoMessageSearchResultCount = new Histogram({
  name: 'echo_message_search_result_count',
  help: 'Number of messages returned per search request',
  labelNames: ['scope'],
  buckets: [0, 1, 2, 4, 8, 16, 24, 32, 50, 100],
  registers: [registry],
});

/** REST RED slice — low-cardinality route_group (not raw paths). */
export const echoRestHttpRequestsTotal = new Counter({
  name: 'echo_rest_http_requests_total',
  help: 'HTTP requests completed by route group, method, and status class',
  labelNames: ['route_group', 'method', 'status_class'],
  registers: [registry],
});

export const echoRestHttpRequestDurationSeconds = new Histogram({
  name: 'echo_rest_http_request_duration_seconds',
  help: 'HTTP request duration in seconds by route group',
  labelNames: ['route_group'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15],
  registers: [registry],
});

/** Postgres query roundtrips (pool.query and PoolClient.query). */
export const echoPgQueryRoundtripsTotal = new Counter({
  name: 'echo_pg_query_roundtrips_total',
  help: 'PostgreSQL query executions by request scope and label',
  labelNames: ['scope', 'label'],
  registers: [registry],
});

/** DM open outcomes (complements echo.dm.open structured logs). */
export const echoDmOpenTotal = new Counter({
  name: 'echo_dm_open_total',
  help: 'POST /dm/open outcomes',
  labelNames: ['outcome'],
  registers: [registry],
});

export const echoVoiceModerateTotal = new Counter({
  name: 'echo_voice_moderate_total',
  help: 'Voice moderation POST outcomes (low-cardinality action + result)',
  labelNames: ['action', 'result'],
  registers: [registry],
});

export const echoLivekitWebhookEventTotal = new Counter({
  name: 'echo_livekit_webhook_event_total',
  help: 'LiveKit webhook events that matched a handler branch',
  labelNames: ['event'],
  registers: [registry],
});

/** Rows removed when DB roster disagrees with LiveKit (stale webhook / crash). */
export const echoVoiceReconcileDeletedTotal = new Counter({
  name: 'echo_voice_reconcile_deleted_total',
  help: 'echo_voice_participants rows deleted by LiveKit reconcile',
  labelNames: ['reason'],
  registers: [registry],
});

/** Browser RTC stats samples (RTT/jitter/loss); not one-way mouth-to-ear latency. */
export const echoVoiceClientQosLatencyMs = new Histogram({
  name: 'echo_voice_client_qos_latency_ms',
  help: 'Client-reported WebRTC RTT estimate while in voice (milliseconds)',
  buckets: [20, 50, 80, 100, 150, 200, 300, 500, 1000, 2000, 5000],
  registers: [registry],
});

export const echoVoiceClientQosJitterMs = new Histogram({
  name: 'echo_voice_client_qos_jitter_ms',
  help: 'Client-reported inbound jitter while in voice (milliseconds)',
  buckets: [1, 5, 10, 20, 30, 50, 80, 120, 200, 500],
  registers: [registry],
});

export const echoVoiceClientQosPacketLossPct = new Histogram({
  name: 'echo_voice_client_qos_packet_loss_pct',
  help: 'Client-reported packet loss percentage while in voice',
  buckets: [0, 0.5, 1, 2, 5, 10, 20, 50, 100],
  registers: [registry],
});

export const echoVoiceClientQosSamplesTotal = new Counter({
  name: 'echo_voice_client_qos_samples_total',
  help: 'Accepted client VC QoS sample POSTs',
  registers: [registry],
});

/** E2EE device pairing REST outcomes (bounded `result` labels). */
export const echoE2eePairingTotal = new Counter({
  name: 'echo_e2ee_pairing_total',
  help: 'E2EE pairing HTTP outcomes',
  labelNames: ['result'],
  registers: [registry],
});

/** E2EE encryption block / envelope rejected in shared message payload validation. */
export const echoE2eeEnvelopeRejectedTotal = new Counter({
  name: 'echo_e2ee_envelope_rejected_total',
  help: 'E2EE wire validation rejections (encryption block + envelope bounds)',
  labelNames: ['reason'],
  registers: [registry],
});

/** Discord bot webhook hook rejections (auth, replay, validation). */
export const echoDiscordBotWebhookRejectTotal = new Counter({
  name: 'echo_discord_bot_webhook_reject_total',
  help: 'Discord bot webhook hook requests rejected before handler',
  labelNames: ['reason'],
  registers: [registry],
});

/** Discord bridge ingest outcomes from bot relay. */
export const echoDiscordBridgeInboundTotal = new Counter({
  name: 'echo_discord_bridge_inbound_total',
  help: 'Discord bridge inbound hook handler outcomes',
  labelNames: ['event', 'result'],
  registers: [registry],
});

export function getEchoMetricsRegistry(): Registry {
  return registry;
}
