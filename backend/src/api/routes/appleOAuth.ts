import { randomInt } from 'crypto';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { APPLE_LOGIN_ROUTE_RATE } from '../meLinkRouteRateLimits';
import { ipRateLimitKey } from '../rateLimitKeys';
import { sendError } from '../errors';
import { getAuthStore } from '../../auth/store';
import { issueEchoBrowserSession } from '../../auth/issueBrowserSession';
import { authSessionJsonBody } from '../../auth/authSessionResponse';
import { loginAuditDigests } from '../../auth/loginAudit';
import { clearGuestBindingCookie } from '../../auth/sessionCookies';
import {
  appleClaimIsTrue,
  verifyAppleIdentityToken,
} from '../../services/integrations/appleOidc';
import { tryJoinOfficialEchoServerOnSignup } from '../../services/auth/officialEchoServerOnSignup';
import type { AuthUser } from '../../auth/types';
import { getPgPool } from '../../db/pg';
import {
  getUserIdByAppleSub,
  upsertAppleUserLink,
} from '../../domain/appleUserLinkRepo';

type AppleLoginBody = {
  identityToken?: string;
  nonce?: string;
  displayName?: string;
};

function usernameBaseFromEmail(email: string): string {
  const local = email.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '') || '';
  return local || 'apple_user';
}

/**
 * Sign in with Apple — native identity-token flow.
 *
 * The iOS app runs `ASAuthorizationController`, receives an identity token, and
 * POSTs it here. We verify the token against Apple's JWKS and establish an Echo
 * browser session. Accounts are matched/created by the (app-stable) email Apple
 * returns in the identity token.
 *
 * Accounts are keyed by Apple `sub` via `auth_apple_user_links` so returning
 * users with a rotated private-relay email still resolve to the same account.
 */
export default async function appleOAuthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  await fastify.register(rateLimit, {
    max: 30,
    timeWindow: '15 minutes',
    keyGenerator: (req) => `apple_oauth:${ipRateLimitKey(req)}`,
    addHeaders: { 'retry-after': true },
  });

  fastify.post<{ Body?: AppleLoginBody }>(
    '/apple/login',
    {
      config: { rateLimit: APPLE_LOGIN_ROUTE_RATE },
    },
    async (req, reply) => {
      const { store, mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Sign in with Apple requires a database.',
        );
      }

      const identityToken =
        typeof req.body?.identityToken === 'string'
          ? req.body.identityToken.trim()
          : '';
      if (!identityToken) {
        return sendError(
          reply,
          400,
          'BAD_REQUEST',
          'identityToken is required.',
        );
      }
      const nonce =
        typeof req.body?.nonce === 'string' ? req.body.nonce.trim() : '';

      let claims;
      try {
        claims = await verifyAppleIdentityToken(identityToken, {
          expectedNonce: nonce || undefined,
        });
      } catch (err) {
        fastify.log.warn({ err }, 'apple_oauth_verify_failed');
        return sendError(
          reply,
          401,
          'APPLE_TOKEN_INVALID',
          'Could not verify the Apple identity token.',
        );
      }

      const pool = getPgPool();
      const appleSub = claims.sub?.trim() || '';
      if (!appleSub) {
        return sendError(
          reply,
          401,
          'APPLE_TOKEN_INVALID',
          'Apple identity token is missing a subject.',
        );
      }

      const email = claims.email?.trim().toLowerCase() || '';
      const emailVerifiedFromIdp = appleClaimIsTrue(claims.email_verified);
      const displayName =
        typeof req.body?.displayName === 'string'
          ? req.body.displayName.trim().slice(0, 80)
          : '';

      let user: AuthUser | null = null;

      if (pool) {
        const linkedUserId = await getUserIdByAppleSub(pool, appleSub);
        if (linkedUserId) {
          user = await store.getUserById(linkedUserId);
        }
      }

      if (!user && email) {
        user = await store.findPasswordUserByEmail(email);
      }

      if (!user) {
        if (!email) {
          return sendError(
            reply,
            409,
            'APPLE_EMAIL_MISSING',
            'Apple did not share an email for this sign-in. Sign in with your email and password instead.',
          );
        }
        const base = usernameBaseFromEmail(email);
        try {
          try {
            user = await store.createOAuthUser({
              username: base,
              email,
              displayName: displayName || undefined,
              emailVerifiedFromIdp,
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : undefined;
            if (msg === 'USERNAME_TAKEN') {
              user = await store.createOAuthUser({
                username: `${base}${randomInt(1000, 10_000)}`,
                email,
                displayName: displayName || undefined,
                emailVerifiedFromIdp,
              });
            } else if (msg === 'EMAIL_IN_USE') {
              user = await store.findPasswordUserByEmail(email);
              if (!user) throw err;
            } else {
              throw err;
            }
          }
          void tryJoinOfficialEchoServerOnSignup(fastify.log, user.id, {
            joinClientIp: req.ip,
            io: fastify.io,
          });
        } catch (err) {
          fastify.log.error({ err }, 'apple_oauth_provision_failed');
          return sendError(
            reply,
            500,
            'PERSIST_FAILED',
            'Could not create your account.',
          );
        }
      }

      if (pool && user) {
        try {
          await upsertAppleUserLink(pool, {
            userId: user.id,
            appleSub,
            appleEmail: email || null,
          });
        } catch (err) {
          fastify.log.warn(
            { err, userId: user.id },
            'apple_oauth_link_upsert_failed',
          );
        }
      }

      if (!user) {
        return sendError(
          reply,
          500,
          'PERSIST_FAILED',
          'Could not resolve your account.',
        );
      }

      if (user.totpEnabled) {
        return sendError(
          reply,
          409,
          'APPLE_LOGIN_MFA',
          'This account uses two-factor auth. Sign in with email and password.',
        );
      }

      try {
        clearGuestBindingCookie(reply);
        const session = await issueEchoBrowserSession(
          store,
          { id: user.id, username: user.username },
          reply,
          req,
        );
        const audit = loginAuditDigests(req);
        void store.recordLoginEvent({
          userId: user.id,
          eventType: 'login_success',
          ipDigest: audit.ipDigest,
          uaDigest: audit.uaDigest,
        });
        return reply.code(200).send(authSessionJsonBody(session));
      } catch (err) {
        fastify.log.error({ err }, 'apple_oauth_session_failed');
        return sendError(
          reply,
          500,
          'PERSIST_FAILED',
          'Could not start your session.',
        );
      }
    },
  );
}
