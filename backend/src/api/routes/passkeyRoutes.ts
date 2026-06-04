import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
} from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { passkeyCeremonyRateLimitKey } from '../sharedMutationRateLimits';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { sendError } from '../errors';
import { config } from '../../config';
import { getAuthStore } from '../../auth/store';
import { requireAuth } from '../../auth/middleware';
import { loginAuditDigests } from '../../auth/loginAudit';
import { issueEchoBrowserSession } from '../../auth/issueBrowserSession';
import { signMfaPendingToken } from '../../auth/token';
import { clearGuestBindingCookie } from '../../auth/sessionCookies';
import {
  newWebAuthnChallengeHandle,
  putWebAuthnChallenge,
  takeWebAuthnChallenge,
} from '../../auth/webauthnChallenge';
import {
  assertSensitiveAccountStepUp,
  sendSensitiveAccountStepUpError,
} from '../../auth/stepUpAuth';

async function requirePasskeySensitiveStepUp(
  req: import('fastify').FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  if (!req.authUser) {
    sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
    return false;
  }
  const { store } = await getAuthStore();
  const userRecord = await store.getUserByUsername(req.authUser.username);
  if (!userRecord) {
    sendError(reply, 404, 'NOT_FOUND', 'User not found');
    return false;
  }
  const body = (req.body ?? {}) as {
    currentPassword?: string;
    totpCode?: string;
  };
  const stepUp = await assertSensitiveAccountStepUp(store, userRecord, body);
  if (!stepUp.ok) {
    sendSensitiveAccountStepUpError(reply, stepUp.reason);
    return false;
  }
  return true;
}

export default async function passkeyRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  await fastify.register(async (regScope) => {
    await regScope.register(rateLimit, {
      max: 12,
      timeWindow: '15 minutes',
      keyGenerator: passkeyCeremonyRateLimitKey,
      addHeaders: { 'retry-after': true },
    });
    regScope.post<{ Body: { currentPassword?: string; totpCode?: string } }>(
      '/passkey/register/options',
      {
        preHandler: [requireAuth],
        schema: {
          body: {
            type: 'object',
            properties: {
              currentPassword: { type: 'string', minLength: 1 },
              totpCode: { type: 'string', minLength: 6, maxLength: 16 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        if (!req.authUser)
          return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
        if (!(await requirePasskeySensitiveStepUp(req, reply))) return;
        if (req.authUser.isGuest) {
          return sendError(
            reply,
            403,
            'GUEST',
            'Guest accounts cannot register passkeys.',
          );
        }
        try {
          const { store, mode } = await getAuthStore();
          if (mode !== 'postgres') {
            return sendError(
              reply,
              503,
              'NOT_AVAILABLE',
              'Passkeys require a database.',
            );
          }
          const existing = await store.listWebAuthnCredentialsForUser(
            req.authUser.id,
          );
          const options = await generateRegistrationOptions({
            rpName: 'Echo',
            rpID: config.echoWebAuthnRpId,
            userID: Buffer.from(req.authUser.id, 'utf8'),
            userName: req.authUser.username,
            attestationType: 'none',
            excludeCredentials: existing.map((c) => ({
              id: c.credentialIdB64,
              type: 'public-key' as const,
            })),
            authenticatorSelection: {
              residentKey: 'required',
              userVerification: 'required',
            },
          });
          const challengeId = newWebAuthnChallengeHandle();
          putWebAuthnChallenge(challengeId, options.challenge, 10 * 60 * 1000);
          return reply.code(200).send({ options, challengeId });
        } catch (err) {
          fastify.log.error(err, 'passkey_register_options_failed');
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Internal Server Error',
          );
        }
      },
    );

    regScope.post<{
      Body: {
        challengeId: string;
        credential: RegistrationResponseJSON;
        label?: string;
        currentPassword?: string;
        totpCode?: string;
      };
    }>(
      '/passkey/register/verify',
      {
        preHandler: [requireAuth],
        schema: {
          body: {
            type: 'object',
            required: ['challengeId', 'credential'],
            properties: {
              challengeId: { type: 'string', minLength: 8 },
              credential: {
                type: 'object',
                additionalProperties: true,
                maxProperties: 64,
              },
              label: { type: 'string', maxLength: 64 },
              currentPassword: { type: 'string', minLength: 1 },
              totpCode: { type: 'string', minLength: 6, maxLength: 16 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        if (!req.authUser)
          return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
        if (!(await requirePasskeySensitiveStepUp(req, reply))) return;
        if (req.authUser.isGuest) {
          return sendError(
            reply,
            403,
            'GUEST',
            'Guest accounts cannot register passkeys.',
          );
        }
        const audit = loginAuditDigests(req);
        try {
          const { store, mode } = await getAuthStore();
          if (mode !== 'postgres') {
            return sendError(
              reply,
              503,
              'NOT_AVAILABLE',
              'Passkeys require a database.',
            );
          }
          const expectedChallenge = takeWebAuthnChallenge(
            req.body.challengeId.trim(),
          );
          if (!expectedChallenge) {
            void store.recordLoginEvent({
              userId: req.authUser.id,
              eventType: 'passkey_register_fail',
              ipDigest: audit.ipDigest,
              uaDigest: audit.uaDigest,
            });
            return sendError(
              reply,
              400,
              'CHALLENGE_EXPIRED',
              'Registration challenge expired. Try again.',
            );
          }
          const verification = await verifyRegistrationResponse({
            response: req.body.credential,
            expectedChallenge,
            expectedOrigin: config.echoWebAuthnOrigin,
            expectedRPID: config.echoWebAuthnRpId,
            requireUserVerification: true,
          });
          if (!verification.verified || !verification.registrationInfo) {
            void store.recordLoginEvent({
              userId: req.authUser.id,
              eventType: 'passkey_register_fail',
              ipDigest: audit.ipDigest,
              uaDigest: audit.uaDigest,
            });
            return sendError(
              reply,
              400,
              'VERIFICATION_FAILED',
              'Could not verify passkey registration.',
            );
          }
          const { credential } = verification.registrationInfo;
          await store.saveWebAuthnCredential(req.authUser.id, {
            credentialIdB64: credential.id,
            publicKey: Buffer.from(credential.publicKey),
            counter: credential.counter,
            transports: credential.transports,
            label: req.body.label,
          });
          void store.recordLoginEvent({
            userId: req.authUser.id,
            eventType: 'passkey_register_success',
            ipDigest: audit.ipDigest,
            uaDigest: audit.uaDigest,
          });
          return reply.code(200).send({ ok: true });
        } catch (err) {
          fastify.log.error(err, 'passkey_register_verify_failed');
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

  await fastify.register(async (credScope) => {
    await credScope.register(rateLimit, {
      max: 60,
      timeWindow: '15 minutes',
      keyGenerator: passkeyCeremonyRateLimitKey,
      addHeaders: { 'retry-after': true },
    });
    credScope.get(
      '/passkey/credentials',
      { preHandler: [requireAuth] },
      async (req, reply) => {
        if (!req.authUser)
          return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
        if (req.authUser.isGuest) {
          return sendError(
            reply,
            403,
            'GUEST',
            'Guest accounts cannot manage passkeys.',
          );
        }
        try {
          const { store, mode } = await getAuthStore();
          if (mode !== 'postgres') {
            return sendError(
              reply,
              503,
              'NOT_AVAILABLE',
              'Passkeys require a database.',
            );
          }
          const rows = await store.listWebAuthnCredentialsForUser(
            req.authUser.id,
          );
          return reply.code(200).send({
            passkeys: rows.map((r) => ({
              id: r.id,
              credentialIdB64: r.credentialIdB64,
              label: r.label,
              createdAt: r.createdAt,
            })),
          });
        } catch (err) {
          fastify.log.error(err, 'passkey_list_credentials_failed');
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Internal Server Error',
          );
        }
      },
    );

    credScope.post<{
      Body: { id: string; currentPassword?: string; totpCode?: string };
    }>(
      '/passkey/credentials/revoke',
      {
        preHandler: [requireAuth],
        schema: {
          body: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', minLength: 4 },
              currentPassword: { type: 'string', minLength: 1 },
              totpCode: { type: 'string', minLength: 6, maxLength: 16 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        if (!req.authUser)
          return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
        if (!(await requirePasskeySensitiveStepUp(req, reply))) return;
        if (req.authUser.isGuest) {
          return sendError(
            reply,
            403,
            'GUEST',
            'Guest accounts cannot manage passkeys.',
          );
        }
        try {
          const { store, mode } = await getAuthStore();
          if (mode !== 'postgres') {
            return sendError(
              reply,
              503,
              'NOT_AVAILABLE',
              'Passkeys require a database.',
            );
          }
          const ok = await store.revokeWebAuthnCredentialForUser(
            req.authUser.id,
            req.body.id.trim(),
          );
          if (!ok) {
            return sendError(reply, 404, 'NOT_FOUND', 'Passkey not found.');
          }
          return reply.code(200).send({ ok: true });
        } catch (err) {
          fastify.log.error(err, 'passkey_revoke_credential_failed');
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Internal Server Error',
          );
        }
      },
    );

    credScope.post<{
      Body: {
        id: string;
        label: string;
        currentPassword?: string;
        totpCode?: string;
      };
    }>(
      '/passkey/credentials/rename',
      {
        preHandler: [requireAuth],
        config: {
          rateLimit: {
            max: 10,
            timeWindow: '1 minute',
            keyGenerator: (req) =>
              req.authUser?.id
                ? `pk_rename:${req.authUser.id}`
                : `pk_rename:${req.ip}`,
          },
        },
        schema: {
          body: {
            type: 'object',
            required: ['id', 'label'],
            properties: {
              id: { type: 'string', minLength: 4 },
              label: { type: 'string', maxLength: 64 },
              currentPassword: { type: 'string', minLength: 1 },
              totpCode: { type: 'string', minLength: 6, maxLength: 16 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        if (!req.authUser)
          return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
        if (!(await requirePasskeySensitiveStepUp(req, reply))) return;
        if (req.authUser.isGuest) {
          return sendError(
            reply,
            403,
            'GUEST',
            'Guest accounts cannot manage passkeys.',
          );
        }
        try {
          const { store, mode } = await getAuthStore();
          if (mode !== 'postgres') {
            return sendError(
              reply,
              503,
              'NOT_AVAILABLE',
              'Passkeys require a database.',
            );
          }
          const ok = await store.renameWebAuthnCredential(
            req.authUser.id,
            req.body.id.trim(),
            req.body.label,
          );
          if (!ok) {
            return sendError(reply, 404, 'NOT_FOUND', 'Passkey not found.');
          }
          return reply.code(200).send({ ok: true });
        } catch (err) {
          fastify.log.error(err, 'passkey_rename_credential_failed');
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

  await fastify.register(async (authScope) => {
    await authScope.register(rateLimit, {
      max: 24,
      timeWindow: '15 minutes',
      keyGenerator: passkeyCeremonyRateLimitKey,
      addHeaders: { 'retry-after': true },
    });
    authScope.post<{ Body: { email?: string; username?: string } }>(
      '/passkey/login/options',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              email: { type: 'string' },
              username: { type: 'string' },
            },
          },
        },
      },
      async (req, reply) => {
        try {
          const { store, mode } = await getAuthStore();
          if (mode !== 'postgres') {
            return sendError(
              reply,
              503,
              'NOT_AVAILABLE',
              'Passkeys require a database.',
            );
          }
          const emailRaw = req.body.email?.trim();
          const usernameRaw = req.body.username?.trim();
          let creds: { credentialIdB64: string }[] = [];
          if (emailRaw) {
            const u = await store.findPasswordUserByEmail(emailRaw);
            if (u && !u.isGuest) {
              creds = await store.listWebAuthnCredentialsForUser(u.id);
            }
          } else if (usernameRaw) {
            const u = await store.getUserByUsername(usernameRaw);
            if (u && !u.isGuest) {
              creds = await store.listWebAuthnCredentialsForUser(u.id);
            }
          }
          const allowCredentials =
            creds.length > 0
              ? creds.map((c) => ({
                  id: c.credentialIdB64,
                  type: 'public-key' as const,
                }))
              : undefined;
          const options = await generateAuthenticationOptions({
            rpID: config.echoWebAuthnRpId,
            allowCredentials,
            userVerification: 'required',
          });
          const challengeId = newWebAuthnChallengeHandle();
          putWebAuthnChallenge(challengeId, options.challenge, 10 * 60 * 1000);
          return reply.code(200).send({ options, challengeId });
        } catch (err) {
          fastify.log.error(err, 'passkey_login_options_failed');
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Internal Server Error',
          );
        }
      },
    );

    authScope.post<{
      Body: { challengeId: string; credential: AuthenticationResponseJSON };
    }>(
      '/passkey/login/verify',
      {
        schema: {
          body: {
            type: 'object',
            required: ['challengeId', 'credential'],
            properties: {
              challengeId: { type: 'string', minLength: 8 },
              credential: {
                type: 'object',
                additionalProperties: true,
                maxProperties: 64,
              },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        const audit = loginAuditDigests(req);
        try {
          const { store, mode } = await getAuthStore();
          if (mode !== 'postgres') {
            return sendError(
              reply,
              503,
              'NOT_AVAILABLE',
              'Passkeys require a database.',
            );
          }
          const expectedChallenge = takeWebAuthnChallenge(
            req.body.challengeId.trim(),
          );
          if (!expectedChallenge) {
            void store.recordLoginEvent({
              userId: null,
              eventType: 'passkey_login_fail',
              ipDigest: audit.ipDigest,
              uaDigest: audit.uaDigest,
            });
            return sendError(
              reply,
              400,
              'CHALLENGE_EXPIRED',
              'Login challenge expired. Try again.',
            );
          }
          const credId = String(req.body.credential.id ?? '').trim();
          const row = credId
            ? await store.findWebAuthnCredential(credId)
            : null;
          if (!row) {
            void store.recordLoginEvent({
              userId: null,
              eventType: 'passkey_login_fail',
              ipDigest: audit.ipDigest,
              uaDigest: audit.uaDigest,
            });
            return sendError(
              reply,
              401,
              'INVALID_CREDENTIALS',
              'Passkey not recognized.',
            );
          }
          const verification = await verifyAuthenticationResponse({
            response: req.body.credential,
            expectedChallenge,
            expectedOrigin: config.echoWebAuthnOrigin,
            expectedRPID: config.echoWebAuthnRpId,
            credential: {
              id: credId,
              publicKey: new Uint8Array(row.publicKey),
              counter: row.counter,
            },
            requireUserVerification: true,
          });
          if (!verification.verified) {
            void store.recordLoginEvent({
              userId: row.userId,
              eventType: 'passkey_login_fail',
              ipDigest: audit.ipDigest,
              uaDigest: audit.uaDigest,
            });
            return sendError(
              reply,
              401,
              'INVALID_CREDENTIALS',
              'Passkey verification failed.',
            );
          }
          await store.updateWebAuthnCredentialCounter(
            credId,
            verification.authenticationInfo.newCounter,
          );
          const user = await store.getUserById(row.userId);
          if (!user || user.isGuest) {
            return sendError(
              reply,
              403,
              'FORBIDDEN',
              'This account cannot sign in with a passkey.',
            );
          }
          if (user.totpEnabled) {
            return reply.code(200).send({
              mfaRequired: true,
              mfaToken: signMfaPendingToken(user.id),
              user: { id: user.id, username: user.username },
            });
          }
          clearGuestBindingCookie(reply);
          const { user: logged, csrfToken } = await issueEchoBrowserSession(
            store,
            { id: user.id, username: user.username },
            reply,
            req,
          );
          void store.recordLoginEvent({
            userId: user.id,
            eventType: 'passkey_login_success',
            ipDigest: audit.ipDigest,
            uaDigest: audit.uaDigest,
          });
          return reply.code(200).send({ user: logged, csrfToken });
        } catch (err) {
          fastify.log.error(err, 'passkey_login_verify_failed');
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
