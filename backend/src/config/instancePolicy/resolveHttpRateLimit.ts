import type { HttpRateLimitBucket } from '../../../../shared/instancePolicy';
import { getInstancePolicy } from './hotReload';

export type HttpRouteRateLimitId =
  | 'auth.register'
  | 'auth.login'
  | 'auth.loginStrict'
  | 'auth.guestMint'
  | 'auth.verifyEmail'
  | 'auth.forgotPassword'
  | 'auth.resetPassword'
  | 'auth.mfaLogin'
  | 'auth.mfaLoginStrict'
  | 'mutations.discordImportBind'
  | 'mutations.discordImportRunFull'
  | 'mutations.discordImportChannel'
  | 'mutations.discordImportRefresh'
  | 'mutations.e2eeDeviceMutation'
  | 'mutations.emojiUsage'
  | 'mutations.discordBridgePut'
  | 'mutations.passkeyCeremony'
  | 'mutations.authProfilePatch'
  | 'mutations.messagePatch'
  | 'mutations.mlsWrite'
  | 'mutations.mlsRead'
  | 'mutations.readStateWrite';

const ROUTE_BUCKETS: Record<HttpRouteRateLimitId, () => HttpRateLimitBucket> = {
  'auth.register': () => getInstancePolicy().limits.http.routes.auth.register,
  'auth.login': () => getInstancePolicy().limits.http.routes.auth.login,
  'auth.loginStrict': () =>
    getInstancePolicy().limits.http.routes.auth.loginStrict,
  'auth.guestMint': () => getInstancePolicy().limits.http.routes.auth.guestMint,
  'auth.verifyEmail': () =>
    getInstancePolicy().limits.http.routes.auth.verifyEmail,
  'auth.forgotPassword': () =>
    getInstancePolicy().limits.http.routes.auth.forgotPassword,
  'auth.resetPassword': () =>
    getInstancePolicy().limits.http.routes.auth.resetPassword,
  'auth.mfaLogin': () => getInstancePolicy().limits.http.routes.auth.mfaLogin,
  'auth.mfaLoginStrict': () =>
    getInstancePolicy().limits.http.routes.auth.mfaLoginStrict,
  'mutations.discordImportBind': () =>
    getInstancePolicy().limits.http.routes.mutations.discordImportBind,
  'mutations.discordImportRunFull': () =>
    getInstancePolicy().limits.http.routes.mutations.discordImportRunFull,
  'mutations.discordImportChannel': () =>
    getInstancePolicy().limits.http.routes.mutations.discordImportChannel,
  'mutations.discordImportRefresh': () =>
    getInstancePolicy().limits.http.routes.mutations.discordImportRefresh,
  'mutations.e2eeDeviceMutation': () =>
    getInstancePolicy().limits.http.routes.mutations.e2eeDeviceMutation,
  'mutations.emojiUsage': () =>
    getInstancePolicy().limits.http.routes.mutations.emojiUsage,
  'mutations.discordBridgePut': () =>
    getInstancePolicy().limits.http.routes.mutations.discordBridgePut,
  'mutations.passkeyCeremony': () =>
    getInstancePolicy().limits.http.routes.mutations.passkeyCeremony,
  'mutations.authProfilePatch': () =>
    getInstancePolicy().limits.http.routes.mutations.authProfilePatch,
  'mutations.messagePatch': () =>
    getInstancePolicy().limits.http.routes.mutations.messagePatch,
  'mutations.mlsWrite': () =>
    getInstancePolicy().limits.http.routes.mutations.mlsWrite,
  'mutations.mlsRead': () =>
    getInstancePolicy().limits.http.routes.mutations.mlsRead,
  'mutations.readStateWrite': () =>
    getInstancePolicy().limits.http.routes.mutations.readStateWrite,
};

export function resolveHttpRateLimit(
  routeId: HttpRouteRateLimitId,
): HttpRateLimitBucket {
  return ROUTE_BUCKETS[routeId]();
}

export function resolveGlobalHttpRateLimitMaxPerMinute(): number {
  return getInstancePolicy().limits.http.global.maxPerMinute;
}

export function resolveEchoApiRateLimitMaxPerMinute(): number {
  return getInstancePolicy().limits.http.echoApi.maxPerMinute;
}
