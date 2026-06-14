import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const gameServerConnectionsTotal = new client.Counter({
  name: 'echo_game_server_connections_total',
  help: 'Socket.IO connections accepted by the game server.',
  labelNames: ['outcome'] as const,
  registers: [register],
});

export const gameServerActiveInstances = new client.Gauge({
  name: 'echo_game_server_active_instances',
  help: 'Live game instances (one per active match/room).',
  labelNames: ['game'] as const,
  registers: [register],
});

export const gameServerActionsTotal = new client.Counter({
  name: 'echo_game_server_actions_total',
  help: 'Client actions processed, by game and outcome.',
  labelNames: ['game', 'outcome'] as const,
  registers: [register],
});

export const gameServerTicksTotal = new client.Counter({
  name: 'echo_game_server_ticks_total',
  help: 'Timed-game tick evaluations that mutated state.',
  labelNames: ['game'] as const,
  registers: [register],
});
