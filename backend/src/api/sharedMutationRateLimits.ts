import type { FastifyRequest } from 'fastify';
import {
  resolveHttpRateLimit,
  type HttpRouteRateLimitId,
} from '../config/instancePolicy/resolveHttpRateLimit';
import { authUserOrIpRateLimitKey } from './rateLimitKeys';

function mutationRate(routeId: HttpRouteRateLimitId) {
  const bucket = resolveHttpRateLimit(routeId);
  return {
    max: bucket.max,
    timeWindow: bucket.timeWindow,
    keyGenerator: authUserOrIpRateLimitKey,
  };
}

/** Shared per-route rate limit configs for Echo mutation endpoints. */
export const ECHO_DISCORD_IMPORT_BIND_RATE = mutationRate(
  'mutations.discordImportBind',
);
export const ECHO_DISCORD_IMPORT_RUN_FULL_RATE = mutationRate(
  'mutations.discordImportRunFull',
);
export const ECHO_DISCORD_IMPORT_CHANNEL_RATE = mutationRate(
  'mutations.discordImportChannel',
);
export const ECHO_E2EE_DEVICE_MUTATION_RATE = mutationRate(
  'mutations.e2eeDeviceMutation',
);
export const ECHO_EMOJI_USAGE_RATE = mutationRate('mutations.emojiUsage');
export const ECHO_DISCORD_BRIDGE_PUT_RATE = mutationRate(
  'mutations.discordBridgePut',
);

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
  ...mutationRate('mutations.passkeyCeremony'),
  keyGenerator: passkeyCeremonyRateLimitKey,
};

export const AUTH_PROFILE_PATCH_RATE = mutationRate(
  'mutations.authProfilePatch',
);

export const DISCORD_BOT_WEBHOOK_ROUTE_RATE = {
  max: 300,
  timeWindow: '1 minute' as const,
  keyGenerator: (req: FastifyRequest) => `discord_webhook_ip:${req.ip}`,
};

/** Game-server → Echo relay (HMAC); bounded per source IP. */
export const GAME_SERVER_OUTBOUND_ROUTE_RATE = {
  max: 600,
  timeWindow: '1 minute' as const,
  keyGenerator: (req: FastifyRequest) => `game_outbound_ip:${req.ip}`,
};

export const DISCORD_BOT_API_ROUTE_RATE = {
  max: 120,
  timeWindow: '1 minute' as const,
  keyGenerator: (req: FastifyRequest) =>
    req.botApp?.id
      ? `discord_bot:${req.botApp.id}`
      : `discord_bot_ip:${req.ip}`,
};

export const ECHO_DISCORD_IMPORT_REFRESH_RATE = mutationRate(
  'mutations.discordImportRefresh',
);
export const ECHO_MESSAGE_PATCH_RATE = mutationRate('mutations.messagePatch');
export const MLS_WRITE_RATE = mutationRate('mutations.mlsWrite');
export const MLS_READ_RATE = mutationRate('mutations.mlsRead');
export const ECHO_READ_STATE_WRITE_RATE = mutationRate(
  'mutations.readStateWrite',
);

export function authRegisterRouteRate() {
  return resolveHttpRateLimit('auth.register');
}

export function authGuestMintRouteRate() {
  return resolveHttpRateLimit('auth.guestMint');
}

export function authLoginRouteRate() {
  return resolveHttpRateLimit('auth.login');
}

export function authLoginStrictRouteRate() {
  return resolveHttpRateLimit('auth.loginStrict');
}

export function authVerifyEmailRouteRate() {
  return resolveHttpRateLimit('auth.verifyEmail');
}

export function authForgotPasswordRouteRate() {
  return resolveHttpRateLimit('auth.forgotPassword');
}

export function authResetPasswordRouteRate() {
  return resolveHttpRateLimit('auth.resetPassword');
}

export function authMfaLoginRouteRate() {
  return resolveHttpRateLimit('auth.mfaLogin');
}

export function authMfaLoginStrictRouteRate() {
  return resolveHttpRateLimit('auth.mfaLoginStrict');
}
