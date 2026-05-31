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
