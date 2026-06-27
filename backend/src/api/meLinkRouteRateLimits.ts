import type { FastifyRequest } from 'fastify';
import { authUserOrIpRateLimitKey, ipRateLimitKey } from './rateLimitKeys';
import {
  authGuestMintRouteRate,
  authLoginRouteRate,
  authLoginStrictRouteRate,
  authMfaLoginRouteRate,
  authMfaLoginStrictRouteRate,
} from './sharedMutationRateLimits';

/** Authenticated /me link read & unlink routes. */
export const ME_FEDERATED_LINK_RATE = {
  max: 60,
  timeWindow: '1 minute' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

/** OAuth start/callback scopes (per IP). */
export const FEDERATED_OAUTH_FLOW_RATE = {
  max: 60,
  timeWindow: '15 minutes' as const,
  keyGenerator: (req: FastifyRequest) => `federated_oauth_flow:${req.ip}`,
  addHeaders: { 'retry-after': true as const },
};

/** Guest mint (per IP; matches guestRoutes plugin). */
export function guestMintRouteRate() {
  const bucket = authGuestMintRouteRate();
  return {
    max: bucket.max,
    timeWindow: bucket.timeWindow,
    keyGenerator: ipRateLimitKey,
    addHeaders: { 'retry-after': true as const },
  };
}

/** @deprecated Use guestMintRouteRate() for policy-backed limits. */
export const GUEST_MINT_ROUTE_RATE = guestMintRouteRate();

/** Sign in with Apple — native identity-token login (per IP). */
export const APPLE_LOGIN_ROUTE_RATE = {
  max: 30,
  timeWindow: '15 minutes' as const,
  keyGenerator: (req: FastifyRequest) => `apple_oauth:${ipRateLimitKey(req)}`,
  addHeaders: { 'retry-after': true as const },
};

export function loginRouteRate() {
  const bucket = authLoginRouteRate();
  return {
    max: bucket.max,
    timeWindow: bucket.timeWindow,
    keyGenerator: ipRateLimitKey,
  };
}

export function loginStrictRouteRate() {
  const bucket = authLoginStrictRouteRate();
  return {
    max: bucket.max,
    timeWindow: bucket.timeWindow,
    keyGenerator: ipRateLimitKey,
  };
}

export function mfaLoginRouteRate() {
  const bucket = authMfaLoginRouteRate();
  return {
    max: bucket.max,
    timeWindow: bucket.timeWindow,
    keyGenerator: ipRateLimitKey,
  };
}

export function mfaLoginStrictRouteRate() {
  const bucket = authMfaLoginStrictRouteRate();
  return {
    max: bucket.max,
    timeWindow: bucket.timeWindow,
    keyGenerator: ipRateLimitKey,
  };
}
