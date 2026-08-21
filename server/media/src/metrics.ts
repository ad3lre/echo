import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const mediaCdnObjectServeTotal = new client.Counter({
  name: 'echo_media_cdn_object_serve_total',
  help: 'Count of object GET requests served by media-cdn.',
  labelNames: ['outcome', 'origin'] as const,
  registers: [register],
});
