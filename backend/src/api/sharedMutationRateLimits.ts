import type { FastifyRequest } from 'fastify';
import { authUserOrIpRateLimitKey } from './rateLimitKeys';

/** Shared per-route rate limit configs for Echo mutation endpoints. */
export const ECHO_DISCORD_IMPORT_BIND_RATE = {
  max: 10,
  timeWindow: '1 hour' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

export const ECHO_DISCORD_IMPORT_RUN_FULL_RATE = {
  max: 3,
  timeWindow: '1 hour' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

export const ECHO_DISCORD_IMPORT_CHANNEL_RATE = {
  max: 20,
  timeWindow: '1 hour' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

export const ECHO_E2EE_DEVICE_MUTATION_RATE = {
  max: 30,
  timeWindow: '15 minutes' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

export const ECHO_EMOJI_USAGE_RATE = {
  max: 120,
  timeWindow: '15 minutes' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

export const ECHO_DISCORD_BRIDGE_PUT_RATE = {
  max: 30,
  timeWindow: '15 minutes' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

export function e2eePairingRateLimitKey(req: FastifyRequest): string {
  return req.authUser?.id
    ? `echo_e2ee_pairing:${req.authUser.id}`
    : `echo_e2ee_pairing:ip:${req.ip}`;
}

export function passkeyCeremonyRateLimitKey(req: FastifyRequest): string {
  return req.authUser?.id
    ? `passkey_ceremony:${req.authUser.id}`
    : `passkey_ceremony:ip:${req.ip}`;
}

export const PASSKEY_CEREMONY_ROUTE_RATE = {
  max: 12,
  timeWindow: '15 minutes' as const,
  keyGenerator: passkeyCeremonyRateLimitKey,
};

export const AUTH_PROFILE_PATCH_RATE = {
  max: 30,
  timeWindow: '15 minutes' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

export const DISCORD_BOT_WEBHOOK_ROUTE_RATE = {
  max: 300,
  timeWindow: '1 minute' as const,
  keyGenerator: (req: FastifyRequest) => `discord_webhook_ip:${req.ip}`,
};

export const DISCORD_BOT_API_ROUTE_RATE = {
  max: 120,
  timeWindow: '1 minute' as const,
  keyGenerator: (req: FastifyRequest) =>
    req.botApp?.id
      ? `discord_bot:${req.botApp.id}`
      : `discord_bot_ip:${req.ip}`,
};

export const ECHO_DISCORD_IMPORT_REFRESH_RATE = {
  max: 3,
  timeWindow: '1 hour' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

export const ECHO_MESSAGE_PATCH_RATE = {
  max: 60,
  timeWindow: '1 minute' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

export const MLS_WRITE_RATE = {
  max: 60,
  timeWindow: '1 minute' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

export const MLS_READ_RATE = {
  max: 120,
  timeWindow: '1 minute' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};
