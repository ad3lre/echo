import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { GUEST_MINT_ROUTE_RATE } from '../../meLinkRouteRateLimits';
import { ipRateLimitKey } from '../../rateLimitKeys';
import { sendError } from '../../errors';
import { getAuthStore } from '../../../auth/store';
import { requireAuth } from '../../../auth/middleware';
import { MIN_PASSWORD_LENGTH } from '../../../auth/accountPolicy';
import { deleteAllServerSessionsForUser } from '../../../auth/serverSession';
import {
  clearBrowserSessionCookies,
  decodeGuestBindingCookieValue,
  setGuestBindingCookie,
  clearGuestBindingCookie,
  LEGACY_GUEST_BINDING_COOKIE,
  GUEST_BINDING_COOKIE,
} from '../../../auth/sessionCookies';
import { config } from '../../../config';
import type { AuthUpgradeGuestBody } from '../../../auth/types';
import {
  evaluateGuestMint,
  recordFailedGuestCaptcha,
  recordGuestMintSuccess,
} from '../../../services/auth/guestAbuseLimiter';
import { verifyTurnstileToken } from '../../../services/integrations/turnstileVerify';
import { sendSignupVerificationEmail } from '../../../services/auth/emailVerificationActions';
import { issueEchoBrowserSession } from '../../../auth/issueBrowserSession';
import { disconnectAllSocketsForAuthUser } from '../../../services/auth/socketSessionRevocation';
import {
  authHwidAccountCapActive,
  countDistinctAccountsForHwidProfileAndIp,
  hashClientHwidForProfile,
  normalizeClientHwid,
  recordHwidProfileAccountBinding,
} from '../../../services/auth/hwidAccountProfile';
import { tryJoinOfficialEchoServerOnSignup } from '../../../services/auth/officialEchoServerOnSignup';

export default async function guestRoutes(fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    max: 20,
    timeWindow: '15 minutes',
    keyGenerator: ipRateLimitKey,
    addHeaders: { 'retry-after': true },
  });

  fastify.post<{
    Body: { captchaToken?: string; clientHwid?: string };
    Querystring: {
      captchaToken?: string;
      clientHwid?: string;
      diagTraceId?: string;
    };
  }>(
    '/guest',
    {
      config: { rateLimit: GUEST_MINT_ROUTE_RATE },
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            captchaToken: { type: 'string' },
            clientHwid: { type: 'string', maxLength: 2048 },
            diagTraceId: { type: 'string', maxLength: 128 },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        if (!config.guestAccountsEnabled) {
          clearGuestBindingCookie(reply);
          return sendError(
            reply,
            403,
            'GUESTS_DISABLED',
            'Guest accounts are not available. Create an account or sign in.',
          );
        }
        const { store, mode } = await getAuthStore();
        const captchaTokenRaw =
          typeof req.body?.captchaToken === 'string'
            ? req.body.captchaToken
            : typeof req.query?.captchaToken === 'string'
              ? req.query.captchaToken
              : '';
        const captchaToken = captchaTokenRaw.trim();
        const rawGuestBindingCookie = String(
          (req.cookies as Record<string, string | undefined>)?.[
            GUEST_BINDING_COOKIE
          ] ??
            (req.cookies as Record<string, string | undefined>)?.[
              LEGACY_GUEST_BINDING_COOKIE
            ] ??
            '',
        ).trim();
        const guestBinding = rawGuestBindingCookie
          ? decodeGuestBindingCookieValue(rawGuestBindingCookie)
          : null;
        if (rawGuestBindingCookie && !guestBinding) {
          clearGuestBindingCookie(reply);
        }
        if (guestBinding?.userId) {
          const existing = await store.getUserById(guestBinding.userId);
          if (existing?.isGuest && !existing.guestDeletedAt) {
            const suspended =
              existing.guestSuspendedUntil &&
              new Date(existing.guestSuspendedUntil).getTime() > Date.now();
            if (!suspended) {
              const guestUser =
                await store.ensureGuestDisplayAliasIfEmpty(existing);
              const { user: g, csrfToken } = await issueEchoBrowserSession(
                store,
                guestUser,
                reply,
                req,
              );
              setGuestBindingCookie(reply, g.id, req);
              fastify.log.info({
                msg: 'echo_product_analytics',
                event: 'guest_resumed',
                userId: g.id,
              });
              return reply
                .code(200)
                .send({ user: g, resumed: true, csrfToken });
            }
          }
        }

        const ip = req.ip;
        const gate = await evaluateGuestMint(ip);
        if (!gate.ok) {
          if (gate.reason === 'GUEST_MINT_BLOCKED') {
            return sendError(
              reply,
              429,
              'GUEST_MINT_BLOCKED',
              'Too many attempts from this network. Try again later or create an account.',
            );
          }
          return sendError(
            reply,
            429,
            'GUEST_MINT_LIMIT',
            'Guest sign-in limit reached from this network. Create an account or try again later.',
          );
        }
        if (gate.requireCaptcha) {
          if (!captchaToken) {
            const siteKey = config.turnstileSiteKey.trim();
            return sendError(
              reply,
              403,
              'CAPTCHA_REQUIRED',
              'Verification required to continue as a guest.',
              siteKey ? JSON.stringify({ siteKey }) : undefined,
            );
          }
          const captchaOk = await verifyTurnstileToken(captchaToken, req.ip);
          if (!captchaOk) {
            await recordFailedGuestCaptcha(ip);
            return sendError(
              reply,
              403,
              'CAPTCHA_FAILED',
              'Verification failed. Please try again.',
            );
          }
        }

        let normalizedHwidForCap: string | null = null;
        if (authHwidAccountCapActive()) {
          const clientHwidRaw =
            typeof req.body?.clientHwid === 'string'
              ? req.body.clientHwid
              : typeof req.query?.clientHwid === 'string'
                ? req.query.clientHwid
                : undefined;
          normalizedHwidForCap = normalizeClientHwid(clientHwidRaw);
          if (!normalizedHwidForCap) {
            return sendError(
              reply,
              400,
              'HWID_REQUIRED',
              'This server requires a stable client device id for new guest sessions. Update the app.',
            );
          }
          const hwidHash = hashClientHwidForProfile(normalizedHwidForCap);
          const existingAccounts =
            await countDistinctAccountsForHwidProfileAndIp(hwidHash, ip);
          if (existingAccounts >= config.authHwidMaxAccountsPerHwidIp) {
            return sendError(
              reply,
              429,
              'ACCOUNT_LIMIT_HWID_IP',
              'Too many accounts from this device on this network. Sign in with an existing account.',
            );
          }
        }

        const created = await store.createGuestUser();
        if (!created) {
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Could not create guest session',
          );
        }
        if (normalizedHwidForCap) {
          await recordHwidProfileAccountBinding(
            created.id,
            normalizedHwidForCap,
            ip,
          );
        }
        const { user: newGuest, csrfToken } = await issueEchoBrowserSession(
          store,
          created,
          reply,
          req,
        );
        setGuestBindingCookie(reply, newGuest.id, req);
        await recordGuestMintSuccess(ip);
        fastify.log.info({
          msg: 'echo_product_analytics',
          event: 'guest_minted',
          userId: newGuest.id,
        });
        void tryJoinOfficialEchoServerOnSignup(fastify.log, newGuest.id, {
          joinClientIp: ip,
        });
        return reply
          .code(201)
          .send({ user: newGuest, resumed: false, csrfToken });
      } catch (err) {
        fastify.log.error(err, 'Auth guest mint failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    },
  );

  fastify.post<{ Body: AuthUpgradeGuestBody }>(
    '/guest/upgrade',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', minLength: 3, maxLength: 254 },
            password: { type: 'string', minLength: MIN_PASSWORD_LENGTH },
            username: { type: 'string' },
            displayName: { type: 'string' },
            pfp: { type: 'string' },
            diagTraceId: { type: 'string', maxLength: 128 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!req.authUser?.isGuest) {
        return sendError(
          reply,
          400,
          'NOT_GUEST',
          'Account is already a full member',
        );
      }
      try {
        const { store, mode } = await getAuthStore();
        const user = await store.upgradeGuestAccount(req.authUser.id, {
          email: req.body.email,
          password: req.body.password,
          ...(req.body.username?.trim()
            ? { username: req.body.username.trim() }
            : {}),
          ...(req.body.displayName?.trim()
            ? { displayName: req.body.displayName.trim() }
            : {}),
          ...(typeof req.body.pfp === 'string' && req.body.pfp.trim()
            ? { pfp: req.body.pfp.trim() }
            : {}),
        });
        await store.revokeUserRefreshTokens(user.id);
        clearGuestBindingCookie(reply);
        await deleteAllServerSessionsForUser(user.id);
        await disconnectAllSocketsForAuthUser(
          fastify,
          user.id,
          'guest_upgrade',
        );
        const { user: upgraded, csrfToken } = await issueEchoBrowserSession(
          store,
          user,
          reply,
          req,
        );
        fastify.log.info({
          msg: 'echo_product_analytics',
          event: 'guest_upgrade_completed',
          userId: upgraded.id,
        });
        if (mode === 'postgres' && upgraded.email && !upgraded.emailVerified) {
          void sendSignupVerificationEmail(fastify.log, store, upgraded);
        }
        return reply.code(200).send({ user: upgraded, csrfToken });
      } catch (err: any) {
        if (err?.message === 'INVALID_EMAIL') {
          return sendError(
            reply,
            400,
            'INVALID_EMAIL',
            'Please enter a valid email address.',
          );
        }
        if (err?.message === 'INVALID_EMAIL_PROVIDER') {
          return sendError(
            reply,
            400,
            'INVALID_EMAIL_PROVIDER',
            'Temporary, disposable, or relay inbox domains cannot be used. Sign up with a normal email address you keep long term.',
          );
        }
        if (err?.message === 'WEAK_PASSWORD') {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
          );
        }
        if (err?.message === 'NOT_GUEST') {
          return sendError(reply, 400, 'NOT_GUEST', 'Not a guest account');
        }
        if (err?.message === 'EMAIL_IN_USE') {
          return sendError(
            reply,
            409,
            'EMAIL_IN_USE',
            'That email is already registered. Try logging in instead.',
          );
        }
        if (err?.message === 'USERNAME_TAKEN') {
          return sendError(
            reply,
            409,
            'USERNAME_TAKEN',
            'That username is already taken. Try another.',
          );
        }
        if (err?.message === 'INVALID_USERNAME') {
          return sendError(
            reply,
            400,
            'INVALID_USERNAME',
            'That username isn’t valid. Try a different one.',
          );
        }
        if (err?.message === 'INVALID_DISPLAY_NAME') {
          return sendError(
            reply,
            400,
            'INVALID_DISPLAY_NAME',
            'Display name is invalid.',
          );
        }
        if (err?.message === 'INVALID_BODY') {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Profile photo must be a data URL (when uploads are not configured) or an https URL from the configured object store',
          );
        }
        fastify.log.error(err, 'Guest upgrade failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    },
  );
}
