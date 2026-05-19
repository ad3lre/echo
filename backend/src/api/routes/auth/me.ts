import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { sendError } from '../../errors';
import { getAuthStore } from '../../../auth/store';
import { requireAuth } from '../../../auth/middleware';
import { getServerSession } from '../../../auth/serverSession';
import {
  clearBrowserSessionCookies,
  clearGuestBindingCookie,
} from '../../../auth/sessionCookies';
import { updateCachedUserInAllSessions } from '../../../auth/serverSession';
import { config } from '../../../config';
import type { AuthProfileUpdateBody } from '../../../auth/types';
import { sendSignupVerificationEmail } from '../../../services/auth/emailVerificationActions';
import { sendPhoneVerificationSms } from '../../../services/auth/phoneVerificationActions';
import { getPgPool } from '../../../db/pg';
import { fanoutUserProfileChangeToEchoServers } from '../../../services/echoUserProfileWorkspaceFanout';
import { buildEchoPlanLimitsPublic } from '../../../domain/echoPlanEntitlements';
import { validateEchoStoredBrandingUrl } from '../../../services/storedMediaUrl';
import { disconnectAllSocketsForAuthUser } from '../../../services/auth/socketSessionRevocation';
import { normalizeProfileBannerColor } from '../../../../../shared/profileBannerColor';

export default async function meRoutes(fastify: FastifyInstance) {
  await fastify.register(async (smsScope) => {
    await smsScope.register(rateLimit, {
      max: config.echoSmsSendPerIpPerHour,
      timeWindow: '1 hour',
      keyGenerator: (req) => `sms_send_ip:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    async function handlePhoneSendCode(
      req: FastifyRequest,
      reply: FastifyReply,
      enforceResendCooldown: boolean,
    ) {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      if (req.authUser.isGuest) {
        return sendError(
          reply,
          403,
          'GUEST',
          'Upgrade your account to add a phone number.',
        );
      }
      const pool = getPgPool();
      if (!pool) {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Phone verification requires a database.',
        );
      }
      try {
        const { store, mode } = await getAuthStore();
        if (mode !== 'postgres') {
          return sendError(
            reply,
            503,
            'NOT_AVAILABLE',
            'Phone verification requires a database.',
          );
        }
        await sendPhoneVerificationSms(
          fastify.log,
          pool,
          store,
          req.authUser.id,
          req.ip,
          {
            enforceResendCooldown,
          },
        );
        return reply.code(204).send();
      } catch (err: any) {
        const msg = err?.message;
        if (msg === 'NO_PENDING_PHONE') {
          return sendError(
            reply,
            400,
            'NO_PENDING_PHONE',
            'Set a phone number on your profile first, then request a code.',
          );
        }
        if (msg === 'SMS_OTP_COOLDOWN') {
          return sendError(
            reply,
            429,
            'SMS_OTP_COOLDOWN',
            'Please wait before requesting another code.',
          );
        }
        if (
          msg === 'SMS_SEND_RATE_IP' ||
          msg === 'SMS_SEND_CAP_USER' ||
          msg === 'SMS_SEND_CAP_PHONE'
        ) {
          return sendError(
            reply,
            429,
            'SMS_SEND_LIMIT',
            'Too many verification attempts. Try again later.',
          );
        }
        if (msg === 'TELNYX_SMS_FAILED') {
          return sendError(
            reply,
            502,
            'SMS_DELIVERY_FAILED',
            'Could not send SMS. Try again later.',
          );
        }
        fastify.log.error(err, 'phone_send_code_failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    }

    smsScope.post(
      '/phone/send-code',
      { preHandler: [requireAuth] },
      async (req, reply) => {
        return handlePhoneSendCode(req, reply, false);
      },
    );

    smsScope.post(
      '/phone/resend-code',
      { preHandler: [requireAuth] },
      async (req, reply) => {
        return handlePhoneSendCode(req, reply, true);
      },
    );
  });

  fastify.post<{ Body: { code: string } }>(
    '/phone/verify',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 12,
          timeWindow: '15 minutes',
          keyGenerator: (req) =>
            req.authUser?.id
              ? `phone_verify_uid:${req.authUser.id}`
              : `phone_verify_ip:${req.ip}`,
        },
      },
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string', minLength: 1, maxLength: 32 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      if (req.authUser.isGuest) {
        return sendError(
          reply,
          403,
          'GUEST',
          'Guest accounts cannot verify phone this way.',
        );
      }
      try {
        const { store, mode } = await getAuthStore();
        if (mode !== 'postgres') {
          return sendError(
            reply,
            503,
            'NOT_AVAILABLE',
            'Phone verification requires a database.',
          );
        }
        const ok = await store.verifyPhoneOtpAndConsume(
          req.authUser.id,
          req.body.code,
        );
        if (!ok) {
          return sendError(
            reply,
            400,
            'INVALID_CODE',
            'Invalid or expired verification code.',
          );
        }
        const user = await store.getUserById(req.authUser.id);
        if (!user) return sendError(reply, 404, 'NOT_FOUND', 'User not found');
        return reply.code(200).send({ user });
      } catch (err) {
        fastify.log.error(err, 'phone_verify_failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    },
  );

  fastify.get(
    '/me',
    {
      preHandler: [requireAuth],
    },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      let csrfToken: string | undefined;
      const sid = req.authSessionId?.trim();
      if (sid) {
        const sess = await getServerSession(sid);
        if (sess?.csrfSecret) csrfToken = sess.csrfSecret;
      }
      const pool = getPgPool();
      let userOut = req.authUser;
      let planLimits:
        | Awaited<ReturnType<typeof buildEchoPlanLimitsPublic>>
        | undefined;
      if (pool) {
        try {
          planLimits = await buildEchoPlanLimitsPublic(pool, req.authUser.id);
          userOut = {
            ...req.authUser,
            echoPlan: planLimits.plan,
            hasActiveSubscription:
              planLimits.plan === 'plus' || planLimits.plan === 'black',
          };
        } catch (err) {
          fastify.log.warn({ err }, 'echo_plan_limits_me_failed');
        }
      }
      return reply.code(200).send({
        user: userOut,
        ...(planLimits ? { planLimits } : {}),
        ...(csrfToken ? { csrfToken } : {}),
      });
    },
  );

  fastify.patch<{ Body: AuthProfileUpdateBody }>(
    '/me',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          properties: {
            email: { type: 'string', minLength: 3, maxLength: 254 },
            displayName: { type: 'string', minLength: 1, maxLength: 80 },
            pfp: { type: 'string', maxLength: 2_000_000 },
            diagTraceId: { type: 'string', maxLength: 128 },
            status: {
              type: 'string',
              enum: ['online', 'idle', 'do_not_disturb', 'offline'],
            },
            customStatus: { type: 'string', maxLength: 140 },
            bio: { type: 'string', maxLength: 280 },
            bannerImage: { type: 'string', maxLength: 2_000_000 },
            bannerColor: { type: 'string', maxLength: 200 },
            bannerRefractionEnabled: { type: 'boolean' },
            bannerBlurEnabled: { type: 'boolean' },
            bannerBlackoutEnabled: { type: 'boolean' },
            bannerPositionY: { type: 'number', minimum: 0, maximum: 100 },
            username: { type: 'string', minLength: 2, maxLength: 32 },
            phone: {
              anyOf: [{ type: 'string', maxLength: 32 }, { type: 'null' }],
            },
            showLastOnline: { type: 'boolean' },
            timeZone: {
              anyOf: [
                { type: 'string', minLength: 1, maxLength: 64 },
                { type: 'null' },
              ],
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      if (req.authUser.isGuest && typeof req.body.email === 'string') {
        return sendError(
          reply,
          403,
          'GUEST_EMAIL_LOCKED',
          'Upgrade your guest account to set an email address.',
        );
      }
      if (req.authUser.isGuest && req.body.phone !== undefined) {
        return sendError(
          reply,
          403,
          'GUEST_PHONE_LOCKED',
          'Upgrade your guest account to add a phone number.',
        );
      }
      if (req.authUser.isGuest && typeof req.body.username === 'string') {
        return sendError(
          reply,
          403,
          'GUEST_USERNAME_LOCKED',
          'Upgrade your guest account to change your username.',
        );
      }
      if (
        req.authUser.isDiscordShadow &&
        typeof req.body.username === 'string'
      ) {
        return sendError(
          reply,
          403,
          'USERNAME_SHADOW_LOCKED',
          'This account cannot change its username.',
        );
      }
      const patch: AuthProfileUpdateBody = {};
      if (typeof req.body.email === 'string')
        patch.email = req.body.email.trim();
      if (req.body.phone !== undefined) {
        patch.phone =
          req.body.phone === null ? null : String(req.body.phone).trim();
      }
      if (typeof req.body.displayName === 'string')
        patch.displayName = req.body.displayName.trim();
      if (typeof req.body.username === 'string')
        patch.username = req.body.username.trim();
      if (typeof req.body.pfp === 'string') patch.pfp = req.body.pfp.trim();
      if (req.body.status) patch.status = req.body.status;
      if (typeof req.body.customStatus === 'string')
        patch.customStatus = req.body.customStatus.trim();
      if (typeof req.body.bio === 'string')
        patch.bio = req.body.bio.trim().slice(0, 280);
      if (typeof req.body.bannerImage === 'string')
        patch.bannerImage = req.body.bannerImage.trim();
      if (typeof req.body.bannerColor === 'string') {
        const bannerColor = req.body.bannerColor.trim();
        if (bannerColor) {
          const safeBannerColor = normalizeProfileBannerColor(bannerColor, '');
          if (!safeBannerColor) {
            return sendError(
              reply,
              400,
              'INVALID_BODY',
              'bannerColor must be a hex color or a linear-gradient of hex colors',
            );
          }
          patch.bannerColor = safeBannerColor;
        } else {
          patch.bannerColor = '';
        }
      }
      if (typeof req.body.bannerRefractionEnabled === 'boolean')
        patch.bannerRefractionEnabled = req.body.bannerRefractionEnabled;
      if (typeof req.body.bannerBlurEnabled === 'boolean')
        patch.bannerBlurEnabled = req.body.bannerBlurEnabled;
      if (typeof req.body.bannerBlackoutEnabled === 'boolean')
        patch.bannerBlackoutEnabled = req.body.bannerBlackoutEnabled;
      if (
        typeof req.body.bannerPositionY === 'number' &&
        Number.isFinite(req.body.bannerPositionY)
      )
        patch.bannerPositionY = Math.max(
          0,
          Math.min(100, req.body.bannerPositionY),
        );
      if (typeof req.body.showLastOnline === 'boolean')
        patch.showLastOnline = req.body.showLastOnline;
      if (req.body.timeZone !== undefined) {
        patch.timeZone =
          req.body.timeZone === null ? null : String(req.body.timeZone).trim();
      }

      if (patch.displayName !== undefined && !patch.displayName) {
        return sendError(
          reply,
          400,
          'INVALID_DISPLAY_NAME',
          'Display name cannot be empty',
        );
      }

      if (patch.pfp !== undefined) {
        const t = patch.pfp.trim();
        if (t.length > 0) {
          const v = validateEchoStoredBrandingUrl(t);
          if (!v.ok) {
            return sendError(
              reply,
              400,
              'INVALID_BODY',
              'pfp must be a data URL (when uploads are not configured) or an https URL from the configured object store',
            );
          }
          patch.pfp = v.value;
        } else {
          patch.pfp = '';
        }
      }
      if (patch.bannerImage !== undefined) {
        const t = patch.bannerImage.trim();
        if (t.length > 0) {
          const v = validateEchoStoredBrandingUrl(t);
          if (!v.ok) {
            return sendError(
              reply,
              400,
              'INVALID_BODY',
              'bannerImage must be a data URL (when uploads are not configured) or an https URL from the configured object store',
            );
          }
          patch.bannerImage = v.value;
        } else {
          patch.bannerImage = '';
        }
      }

      const { store, mode } = await getAuthStore();
      let updated: Awaited<ReturnType<typeof store.updateUserProfile>>;
      try {
        updated = await store.updateUserProfile(req.authUser.id, patch);
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
        if (err?.message === 'EMAIL_IN_USE') {
          return sendError(
            reply,
            409,
            'EMAIL_IN_USE',
            'That email is already registered.',
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
        if (err?.message === 'INVALID_USERNAME') {
          return sendError(
            reply,
            400,
            'INVALID_USERNAME',
            'Username is invalid or uses reserved words.',
          );
        }
        if (err?.message === 'USERNAME_TAKEN') {
          return sendError(
            reply,
            409,
            'USERNAME_TAKEN',
            'That username is already taken.',
          );
        }
        if (err?.message === 'USERNAME_GUEST_LOCKED') {
          return sendError(
            reply,
            403,
            'USERNAME_GUEST_LOCKED',
            'Guest accounts cannot change username until upgraded.',
          );
        }
        if (err?.message === 'USERNAME_SHADOW_LOCKED') {
          return sendError(
            reply,
            403,
            'USERNAME_SHADOW_LOCKED',
            'This account cannot change its username.',
          );
        }
        if (err?.message === 'INVALID_PHONE') {
          return sendError(
            reply,
            400,
            'INVALID_PHONE',
            'Please enter a valid phone number.',
          );
        }
        if (err?.message === 'PHONE_IN_USE') {
          return sendError(
            reply,
            409,
            'PHONE_IN_USE',
            'That phone number is already in use.',
          );
        }
        if (err?.message === 'INVALID_TIME_ZONE') {
          return sendError(
            reply,
            400,
            'INVALID_TIME_ZONE',
            'That timezone is not recognized. Pick a valid region from the list.',
          );
        }
        throw err;
      }
      if (!updated) return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      if (
        mode === 'postgres' &&
        patch.email !== undefined &&
        updated.email &&
        !updated.emailVerified
      ) {
        void sendSignupVerificationEmail(fastify.log, store, updated);
      }

      await updateCachedUserInAllSessions(updated.id, updated);

      if (mode === 'postgres') {
        const pool = getPgPool();
        if (pool) {
          void fanoutUserProfileChangeToEchoServers(
            fastify,
            pool,
            updated.id,
          ).catch((err) => {
            fastify.log.warn(
              { err, userId: updated.id },
              'fanout user profile workspace event failed',
            );
          });
        }
      }

      return reply.code(200).send({ user: updated });
    },
  );

  fastify.delete<{ Body: { password: string } }>(
    '/me',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          properties: { password: { type: 'string', minLength: 1 } },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { store } = await getAuthStore();
      const userRecord = await store.getUserByUsername(req.authUser.username);
      if (!userRecord)
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      const ok = await store.verifyPassword(userRecord, req.body.password);
      if (!ok)
        return sendError(reply, 401, 'INVALID_CREDENTIALS', 'Invalid password');
      await store.deleteUserAccount(req.authUser.id);
      await disconnectAllSocketsForAuthUser(
        fastify,
        req.authUser.id,
        'account_deleted',
      );
      clearBrowserSessionCookies(reply);
      clearGuestBindingCookie(reply);
      return reply.code(204).send();
    },
  );
}
