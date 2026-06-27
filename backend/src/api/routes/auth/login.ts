import type { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { sendError } from '../../errors';
import {
  signMfaPendingToken,
  verifyMfaPendingToken,
} from '../../../auth/token';
import { getAuthStore } from '../../../auth/store';
import { clearGuestBindingCookie } from '../../../auth/sessionCookies';
import { isValidEmailFormat } from '../../../auth/email';
import type { AuthLoginBody, AuthLoginMfaBody } from '../../../auth/types';
import { issueEchoBrowserSession } from '../../../auth/issueBrowserSession';
import { authSessionJsonBody } from '../../../auth/authSessionResponse';
import { loginAuditDigests } from '../../../auth/loginAudit';
import { clientIpFromFastifyRequest } from '../../../net/clientIp';
import {
  loginRouteRate,
  loginStrictRouteRate,
  mfaLoginRouteRate,
  mfaLoginStrictRouteRate,
} from '../../meLinkRouteRateLimits';
import {
  evaluateMfaLogin,
  evaluatePasswordLogin,
  loginProtectionKeyForUser,
  loginProtectionKeyForUsername,
  recordMfaLoginFailure,
  recordMfaLoginSuccess,
  recordPasswordLoginFailure,
  recordPasswordLoginSuccess,
} from '../../../services/auth/loginProtection';
import { replyIfInstanceBanned } from '../../../domain/instanceBanEnforcement';
import bcrypt from 'bcrypt';

const DUMMY_HASH =
  '$2b$10$Cm/6wtFYacv3Kh/YTvmAWuaI29ASBONCB4UZ1v8KT8TM04.iNlh1K';

function sendAccountLocked(
  reply: Parameters<typeof sendError>[0],
  retryAfterMs: number,
): ReturnType<typeof sendError> {
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  reply.header('Retry-After', String(retryAfterSec));
  return sendError(
    reply,
    429,
    'ACCOUNT_LOCKED',
    'Too many failed sign-in attempts. Try again later.',
  );
}

export default async function loginRoutes(fastify: FastifyInstance) {
  await fastify.register(async (loginScope) => {
    const loginIdentityRateLimitKey = (req: FastifyRequest): string => {
      let username = '';
      if (req.body && typeof req.body === 'object') {
        const value = (req.body as { username?: unknown }).username;
        if (typeof value === 'string') {
          username = value.trim().toLowerCase();
        }
      }
      return `auth_login_identity:${clientIpFromFastifyRequest(req)}:${username || '__missing__'}`;
    };
    const loginRate = loginRouteRate();
    await loginScope.register(rateLimit, {
      max: loginRate.max,
      timeWindow: loginRate.timeWindow,
      keyGenerator: (req) => `auth_login:${clientIpFromFastifyRequest(req)}`,
      addHeaders: { 'retry-after': true },
    });
    const loginStrictRate = loginStrictRouteRate();
    await loginScope.register(rateLimit, {
      max: loginStrictRate.max,
      timeWindow: loginStrictRate.timeWindow,
      keyGenerator: loginIdentityRateLimitKey,
      addHeaders: { 'retry-after': true },
    });
    loginScope.post<{
      Body: AuthLoginBody;
    }>(
      '/login',
      {
        schema: {
          body: {
            type: 'object',
            required: ['username', 'password'],
            properties: {
              username: { type: 'string', minLength: 1 },
              password: { type: 'string', minLength: 1 },
              diagTraceId: { type: 'string', maxLength: 128 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        const body = req.body as AuthLoginBody;
        try {
          const { store } = await getAuthStore();
          const audit = loginAuditDigests(req);
          const loginId = body.username.trim();
          const usernameKey = loginProtectionKeyForUsername(loginId);
          const userRecord = isValidEmailFormat(loginId)
            ? await store.findPasswordUserByEmail(loginId)
            : await store.getUserByUsername(loginId);

          const accountKey = userRecord
            ? loginProtectionKeyForUser(userRecord.id)
            : usernameKey;
          const gate = await evaluatePasswordLogin(accountKey);
          if (!gate.ok) {
            return sendAccountLocked(reply, gate.retryAfterMs);
          }

          if (!userRecord) {
            await bcrypt.compare(body.password, DUMMY_HASH);
            await recordPasswordLoginFailure(usernameKey);
            void store.recordLoginEvent({
              userId: null,
              eventType: 'login_fail_unknown_user',
              ipDigest: audit.ipDigest,
              uaDigest: audit.uaDigest,
            });
            return sendError(
              reply,
              401,
              'INVALID_CREDENTIALS',
              'Invalid username or password',
            );
          }

          const ok = await store.verifyPassword(userRecord, body.password);
          if (!ok) {
            await recordPasswordLoginFailure(accountKey);
            void store.recordLoginEvent({
              userId: userRecord.id,
              eventType: 'login_fail_bad_password',
              ipDigest: audit.ipDigest,
              uaDigest: audit.uaDigest,
            });
            return sendError(
              reply,
              401,
              'INVALID_CREDENTIALS',
              'Invalid username or password',
            );
          }

          await recordPasswordLoginSuccess(accountKey);

          const full = await store.getUserById(userRecord.id);
          if (full?.isGuest) {
            return sendError(
              reply,
              403,
              'GUEST_USE_CONTINUE',
              'Guest accounts use "Continue as guest" on the sign-in page.',
            );
          }

          clearGuestBindingCookie(reply);

          if (userRecord.totpEnabled) {
            return reply.code(200).send({
              mfaRequired: true,
              mfaToken: signMfaPendingToken(userRecord.id),
              user: { id: userRecord.id, username: userRecord.username },
            });
          }

          void store.recordLoginEvent({
            userId: userRecord.id,
            eventType: 'login_success',
            ipDigest: audit.ipDigest,
            uaDigest: audit.uaDigest,
          });
          if (
            await replyIfInstanceBanned(reply, {
              userId: userRecord.id,
              rawIp: clientIpFromFastifyRequest(req),
            })
          ) {
            return;
          }
          const session = await issueEchoBrowserSession(
            store,
            userRecord,
            reply,
            req,
          );
          return reply.code(200).send(authSessionJsonBody(session));
        } catch (err) {
          fastify.log.error(err, 'Auth login failed');
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Internal Server Error',
          );
        }
      },
    );
  });

  await fastify.register(async (mfaLoginScope) => {
    const mfaIdentityRateLimitKey = (req: FastifyRequest): string => {
      let token = '';
      if (req.body && typeof req.body === 'object') {
        const value = (req.body as { mfaToken?: unknown }).mfaToken;
        if (typeof value === 'string') {
          token = value.trim();
        }
      }
      return `mfa_login_identity:${clientIpFromFastifyRequest(req)}:${token || '__missing__'}`;
    };
    const mfaIpRate = mfaLoginRouteRate();
    await mfaLoginScope.register(rateLimit, {
      max: mfaIpRate.max,
      timeWindow: mfaIpRate.timeWindow,
      keyGenerator: (req) => `mfa_login_ip:${clientIpFromFastifyRequest(req)}`,
      addHeaders: { 'retry-after': true },
    });
    const mfaStrictRate = mfaLoginStrictRouteRate();
    await mfaLoginScope.register(rateLimit, {
      max: mfaStrictRate.max,
      timeWindow: mfaStrictRate.timeWindow,
      keyGenerator: mfaIdentityRateLimitKey,
      addHeaders: { 'retry-after': true },
    });

    mfaLoginScope.post<{ Body: AuthLoginMfaBody }>(
      '/login/mfa',
      {
        schema: {
          body: {
            type: 'object',
            required: ['mfaToken'],
            properties: {
              mfaToken: { type: 'string', minLength: 20 },
              code: { type: 'string', minLength: 6, maxLength: 16 },
              recoveryCode: { type: 'string', minLength: 8, maxLength: 40 },
              diagTraceId: { type: 'string', maxLength: 128 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        const body = req.body as AuthLoginMfaBody;
        const mfaToken = String(body.mfaToken ?? '').trim();
        const codeRaw = body.code !== undefined ? String(body.code).trim() : '';
        const recoveryRaw =
          body.recoveryCode !== undefined
            ? String(body.recoveryCode).trim()
            : '';
        if (!mfaToken) {
          return sendError(reply, 400, 'INVALID_BODY', 'mfaToken is required');
        }
        if ((!codeRaw && !recoveryRaw) || (codeRaw && recoveryRaw)) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Provide exactly one of code (TOTP) or recoveryCode.',
          );
        }
        try {
          const audit = loginAuditDigests(req);
          let userId: string;
          try {
            const payload = verifyMfaPendingToken(mfaToken);
            userId = payload.sub;
          } catch {
            return sendError(
              reply,
              401,
              'INVALID_MFA_TOKEN',
              'MFA step expired or invalid. Sign in again.',
            );
          }

          const mfaGate = await evaluateMfaLogin(userId);
          if (!mfaGate.ok) {
            return sendAccountLocked(reply, mfaGate.retryAfterMs);
          }

          const { store, mode } = await getAuthStore();
          if (mode !== 'postgres') {
            return sendError(
              reply,
              503,
              'NOT_AVAILABLE',
              'Two-factor login requires a database.',
            );
          }
          const user = await store.getUserById(userId);
          if (!user || user.isGuest) {
            return sendError(
              reply,
              401,
              'INVALID_MFA_TOKEN',
              'MFA step expired or invalid. Sign in again.',
            );
          }
          if (!user.totpEnabled) {
            return sendError(
              reply,
              400,
              'MFA_NOT_REQUIRED',
              'Two-factor authentication is not enabled for this account.',
            );
          }
          let factorOk = false;
          if (codeRaw) {
            factorOk = await store.verifyTotpForLogin(userId, codeRaw);
          } else {
            factorOk = await store.consumeRecoveryCode(userId, recoveryRaw);
          }
          if (!factorOk) {
            await recordMfaLoginFailure(userId);
            void store.recordLoginEvent({
              userId,
              eventType: 'login_fail_mfa',
              ipDigest: audit.ipDigest,
              uaDigest: audit.uaDigest,
            });
            return sendError(
              reply,
              401,
              'INVALID_MFA_CODE',
              'Invalid authentication code.',
            );
          }
          await recordMfaLoginSuccess(userId);
          clearGuestBindingCookie(reply);
          void store.recordLoginEvent({
            userId,
            eventType: 'login_success_mfa',
            ipDigest: audit.ipDigest,
            uaDigest: audit.uaDigest,
          });
          if (
            await replyIfInstanceBanned(reply, {
              userId,
              rawIp: clientIpFromFastifyRequest(req),
            })
          ) {
            return;
          }
          const session = await issueEchoBrowserSession(
            store,
            { id: user.id, username: user.username },
            reply,
            req,
          );
          return reply.code(200).send(authSessionJsonBody(session));
        } catch (err) {
          fastify.log.error(err, 'Auth login mfa failed');
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Internal Server Error',
          );
        }
      },
    );
  });
}
