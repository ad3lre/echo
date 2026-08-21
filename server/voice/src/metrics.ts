import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const voiceSidecarIngestTotal = new client.Counter({
  name: 'echo_voice_sidecar_ingest_total',
  help: 'Count of ingested VC events into the Layer 2 sidecar.',
  labelNames: ['source', 'event'] as const,
  registers: [register],
});

export const voiceSidecarPipelineTickTotal = new client.Counter({
  name: 'echo_voice_sidecar_pipeline_tick_total',
  help: 'Count of pipeline evaluations (state->policy->diff).',
  labelNames: ['reason'] as const,
  registers: [register],
});
