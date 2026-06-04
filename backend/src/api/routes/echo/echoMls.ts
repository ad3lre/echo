import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import { sendError } from '../../errors';
import {
  appendMlsCommit,
  appendMlsProposal,
  authorizeVoiceMlsAccess,
  claimMlsKeyPackage,
  fetchMlsMessagesSince,
  getMlsGroupInfo,
  initMlsGroupIfAbsent,
  publishMlsKeyPackages,
  type AppendCommitResult,
  type AppendProposalResult,
  type InitMlsGroupResult,
} from '../../../domain/echoStore';
import {
  assertEchoE2eePeerBundleFetchQuota,
  echoUsersMayFetchE2eeDeviceBundle,
} from '../../../domain/echoStore/e2ee';
import { ECHO_DM_REALM_SERVER_ID } from '../../../domain/echoStore/dmThreads';
import { nextEchoSnowflakeId } from '../../../domain/echoSnowflake';
import { publishVoiceMlsMessage } from '../../../platform/echoPlatformEvents';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

const MLS_WRITE_RATE = {
  max: 60,
  timeWindow: '1 minute' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

function sendInitError(reply: FastifyReply, r: InitMlsGroupResult): unknown {
  if (r.ok) return null;
  switch (r.reason) {
    case 'forbidden':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Cannot access this voice channel.',
      );
    case 'e2ee_disabled':
      return sendError(
        reply,
        403,
        'VOICE_E2EE_DISABLED',
        'Voice E2EE is not enabled here.',
      );
    case 'invalid_body':
      return sendError(reply, 400, 'INVALID_BODY', 'Invalid MLS group info.');
    case 'infra_missing':
      return sendError(
        reply,
        503,
        'E2EE_STORAGE_UNAVAILABLE',
        'Encrypted voice storage unavailable.',
      );
    default:
      return sendError(reply, 500, 'INTERNAL', 'MLS init failed.');
  }
}

function sendCommitError(reply: FastifyReply, r: AppendCommitResult): unknown {
  if (r.ok) return null;
  switch (r.reason) {
    case 'forbidden':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Cannot access this voice channel.',
      );
    case 'e2ee_disabled':
      return sendError(
        reply,
        403,
        'VOICE_E2EE_DISABLED',
        'Voice E2EE is not enabled here.',
      );
    case 'not_in_voice':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Join the voice channel before committing key changes.',
      );
    case 'invalid_body':
      return sendError(
        reply,
        400,
        'INVALID_BODY',
        'Invalid MLS commit payload.',
      );
    case 'epoch_conflict':
      return sendError(
        reply,
        409,
        'VOICE_MLS_EPOCH_CONFLICT',
        'Group epoch advanced. Re-sync and retry.',
      );
    case 'infra_missing':
      return sendError(
        reply,
        503,
        'E2EE_STORAGE_UNAVAILABLE',
        'Encrypted voice storage unavailable.',
      );
    default:
      return sendError(reply, 500, 'INTERNAL', 'MLS commit failed.');
  }
}

function sendProposalError(
  reply: FastifyReply,
  r: AppendProposalResult,
): unknown {
  if (r.ok) return null;
  switch (r.reason) {
    case 'forbidden':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Cannot access this voice channel.',
      );
    case 'e2ee_disabled':
      return sendError(
        reply,
        403,
        'VOICE_E2EE_DISABLED',
        'Voice E2EE is not enabled here.',
      );
    case 'not_in_voice':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Join the voice channel first.',
      );
    case 'invalid_body':
      return sendError(
        reply,
        400,
        'INVALID_BODY',
        'Invalid MLS proposal payload.',
      );
    case 'infra_missing':
      return sendError(
        reply,
        503,
        'E2EE_STORAGE_UNAVAILABLE',
        'Encrypted voice storage unavailable.',
      );
    default:
      return sendError(reply, 500, 'INTERNAL', 'MLS proposal failed.');
  }
}

function parseWelcomes(raw: unknown): Array<{
  recipientUserId: string;
  recipientDeviceId: string;
  payload: string;
}> | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: Array<{
    recipientUserId: string;
    recipientDeviceId: string;
    payload: string;
  }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const o = item as Record<string, unknown>;
    const recipientUserId =
      typeof o.recipientUserId === 'string' ? o.recipientUserId.trim() : '';
    const recipientDeviceId =
      typeof o.recipientDeviceId === 'string' ? o.recipientDeviceId.trim() : '';
    const payload = typeof o.payload === 'string' ? o.payload.trim() : '';
    if (!recipientUserId || !recipientDeviceId || !payload) return null;
    out.push({ recipientUserId, recipientDeviceId, payload });
  }
  return out;
}

function str(body: Record<string, unknown> | undefined, key: string): string {
  const v = body?.[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** Shared handlers parameterized by serverId (DM realm vs guild). */
async function handleGroupInfo(
  req: FastifyRequest,
  reply: FastifyReply,
  serverId: string,
  channelId: string,
): Promise<unknown> {
  const pool = echoPool(req);
  const userId = getAuthUser(req).id;
  const access = await authorizeVoiceMlsAccess(
    pool,
    serverId,
    channelId,
    userId,
  );
  if (!access.ok)
    return sendError(
      reply,
      403,
      'FORBIDDEN',
      'Cannot access this voice channel.',
    );
  if (!access.enabled) {
    return reply.code(200).send({
      enabled: false,
      groupId: null,
      currentEpoch: null,
      groupInfo: null,
    });
  }
  const info = await getMlsGroupInfo(pool, serverId, channelId);
  return reply.code(200).send({
    enabled: true,
    groupId: info?.groupId ?? null,
    currentEpoch: info?.currentEpoch ?? null,
    groupInfo: info?.groupInfo ?? null,
  });
}

async function handleMessages(
  req: FastifyRequest,
  reply: FastifyReply,
  serverId: string,
  channelId: string,
): Promise<unknown> {
  const pool = echoPool(req);
  const userId = getAuthUser(req).id;
  const q = req.query as Record<string, unknown> | undefined;
  const sinceSeq = typeof q?.since === 'string' ? q.since : '0';
  const limit = typeof q?.limit === 'string' ? Number(q.limit) : undefined;
  const r = await fetchMlsMessagesSince(pool, {
    serverId,
    channelId,
    userId,
    sinceSeq,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  if (!r.ok)
    return sendError(
      reply,
      403,
      'FORBIDDEN',
      'Cannot access this voice channel.',
    );
  return reply.code(200).send({ messages: r.messages });
}

async function handleInit(
  req: FastifyRequest,
  reply: FastifyReply,
  serverId: string,
  channelId: string,
): Promise<unknown> {
  const pool = echoPool(req);
  const body = req.body as Record<string, unknown> | undefined;
  const groupInfo = str(body, 'groupInfo');
  if (!groupInfo)
    return sendError(reply, 400, 'INVALID_BODY', 'groupInfo required');
  const r = await initMlsGroupIfAbsent(pool, {
    serverId,
    channelId,
    actorUserId: getAuthUser(req).id,
    groupInfo,
  });
  const err = sendInitError(reply, r);
  if (err) return err;
  if (!r.ok) return; // unreachable; satisfies type narrowing
  return reply.code(200).send({
    created: r.created,
    groupId: r.groupId,
    currentEpoch: r.currentEpoch,
  });
}

async function handleCommit(
  fastify: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  serverId: string,
  channelId: string,
): Promise<unknown> {
  const pool = echoPool(req);
  const userId = getAuthUser(req).id;
  const body = req.body as Record<string, unknown> | undefined;
  const expectedEpoch = str(body, 'expectedEpoch');
  const commit = str(body, 'commit');
  const groupInfo = str(body, 'groupInfo');
  const deviceId = str(body, 'deviceId');
  const welcomes = parseWelcomes(body?.welcomes);
  if (
    !expectedEpoch ||
    !commit ||
    !groupInfo ||
    !deviceId ||
    welcomes === null
  ) {
    return sendError(
      reply,
      400,
      'INVALID_BODY',
      'expectedEpoch, commit, groupInfo, deviceId required',
    );
  }
  const result = await appendMlsCommit(pool, {
    serverId,
    channelId,
    actorUserId: userId,
    actorDeviceId: deviceId,
    expectedEpoch,
    commit,
    groupInfo,
    welcomes,
  });
  const err = sendCommitError(reply, result);
  if (err) return err;
  if (!result.ok) return;
  const groupId = await mlsGroupIdOf(pool, serverId, channelId);
  await notifyMlsMessage(fastify, pool, {
    serverId,
    channelId,
    seq: result.seq,
    epoch: result.epoch,
    msgType: 'commit',
    actorUserId: userId,
    groupId,
  });
  // Welcomes are addressed; notify each recipient so they pull and join.
  for (const w of welcomes) {
    publishVoiceMlsMessage(fastify, {
      version: nextEchoSnowflakeId(),
      serverId,
      channelId,
      groupId,
      seq: result.seq,
      epoch: result.epoch,
      msgType: 'welcome',
      recipientUserId: w.recipientUserId,
      recipientDeviceId: w.recipientDeviceId,
      dmMemberUserIds:
        serverId === ECHO_DM_REALM_SERVER_ID ? [w.recipientUserId] : undefined,
    });
  }
  return reply.code(200).send({ seq: result.seq, epoch: result.epoch });
}

async function handleProposal(
  fastify: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  serverId: string,
  channelId: string,
): Promise<unknown> {
  const pool = echoPool(req);
  const userId = getAuthUser(req).id;
  const body = req.body as Record<string, unknown> | undefined;
  const epoch = str(body, 'epoch');
  const payload = str(body, 'payload');
  const deviceId = str(body, 'deviceId');
  if (!epoch || !payload || !deviceId) {
    return sendError(
      reply,
      400,
      'INVALID_BODY',
      'epoch, payload, deviceId required',
    );
  }
  const result = await appendMlsProposal(pool, {
    serverId,
    channelId,
    actorUserId: userId,
    actorDeviceId: deviceId,
    epoch,
    payload,
  });
  const err = sendProposalError(reply, result);
  if (err) return err;
  if (!result.ok) return;
  await notifyMlsMessage(fastify, pool, {
    serverId,
    channelId,
    seq: result.seq,
    epoch,
    msgType: 'proposal',
    actorUserId: userId,
    groupId: await mlsGroupIdOf(pool, serverId, channelId),
  });
  return reply.code(200).send({ seq: result.seq });
}

async function mlsGroupIdOf(
  pool: ReturnType<typeof echoPool>,
  serverId: string,
  channelId: string,
): Promise<string> {
  const info = await getMlsGroupInfo(pool, serverId, channelId);
  return info?.groupId ?? '';
}

async function notifyMlsMessage(
  fastify: FastifyInstance,
  pool: ReturnType<typeof echoPool>,
  args: {
    serverId: string;
    channelId: string;
    seq: string;
    epoch: string;
    msgType: 'commit' | 'proposal';
    actorUserId: string;
    groupId: string;
  },
): Promise<void> {
  const groupId = args.groupId;
  let dmMemberUserIds: string[] | undefined;
  if (args.serverId === ECHO_DM_REALM_SERVER_ID) {
    const access = await authorizeVoiceMlsAccess(
      pool,
      args.serverId,
      args.channelId,
      args.actorUserId,
    );
    dmMemberUserIds =
      access.ok && access.dmMemberUserIds
        ? access.dmMemberUserIds
        : [args.actorUserId];
  }
  publishVoiceMlsMessage(fastify, {
    version: nextEchoSnowflakeId(),
    serverId: args.serverId,
    channelId: args.channelId,
    groupId,
    seq: args.seq,
    epoch: args.epoch,
    msgType: args.msgType,
    dmMemberUserIds,
  });
}

export default async function echoMlsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  // ---- Key packages (publish own / claim peer) ----
  fastify.post(
    '/e2ee/mls/key-packages',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: MLS_WRITE_RATE },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const body = req.body as Record<string, unknown> | undefined;
      const deviceId = str(body, 'deviceId');
      const rawPkgs = body?.packages;
      const packages = Array.isArray(rawPkgs)
        ? rawPkgs
            .map((p) => {
              const o = (p ?? {}) as Record<string, unknown>;
              return {
                ref: typeof o.ref === 'string' ? o.ref : '',
                keyPackage:
                  typeof o.keyPackage === 'string' ? o.keyPackage : '',
              };
            })
            .filter((p) => p.ref && p.keyPackage)
        : [];
      const r = await publishMlsKeyPackages(pool, {
        userId: getAuthUser(req).id,
        deviceId,
        packages,
      });
      if (r === 'ok') return reply.code(204).send();
      if (r === 'device_invalid')
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Unknown or revoked device.',
        );
      if (r === 'infra_missing')
        return sendError(
          reply,
          503,
          'E2EE_STORAGE_UNAVAILABLE',
          'Storage unavailable.',
        );
      return sendError(reply, 400, 'INVALID_BODY', 'Invalid key packages.');
    },
  );

  fastify.get<{ Params: { userId: string; deviceId: string } }>(
    '/e2ee/mls/peer/:userId/device/:deviceId/key-package',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const me = getAuthUser(req).id;
      const target = trimEchoPathParam(req.params.userId);
      const targetDevice = trimEchoPathParam(req.params.deviceId);
      if (!target || !targetDevice)
        return sendError(reply, 400, 'INVALID_BODY', 'user/device required');
      if (target !== me) {
        const may = await echoUsersMayFetchE2eeDeviceBundle(pool, me, target);
        if (!may) {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Not allowed to fetch this key package.',
          );
        }
        const quota = await assertEchoE2eePeerBundleFetchQuota(
          pool,
          me,
          target,
        );
        if (quota === 'rate_limited') {
          return sendError(
            reply,
            429,
            'RATE_LIMITED',
            'Too many key package requests for this user. Try again later.',
          );
        }
      }
      const kp = await claimMlsKeyPackage(pool, target, targetDevice);
      if (!kp)
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'No key package for this device.',
        );
      return reply.code(200).send({ ref: kp.ref, keyPackage: kp.keyPackage });
    },
  );

  // ---- DM voice MLS ----
  fastify.get<{ Params: { channelId: string } }>(
    '/dm/channels/:channelId/voice/mls/group-info',
    { preHandler: [requireAuth, requireEchoStore] },
    (req, reply) =>
      handleGroupInfo(
        req,
        reply,
        ECHO_DM_REALM_SERVER_ID,
        trimEchoPathParam(req.params.channelId),
      ),
  );
  fastify.get<{ Params: { channelId: string } }>(
    '/dm/channels/:channelId/voice/mls/messages',
    { preHandler: [requireAuth, requireEchoStore] },
    (req, reply) =>
      handleMessages(
        req,
        reply,
        ECHO_DM_REALM_SERVER_ID,
        trimEchoPathParam(req.params.channelId),
      ),
  );
  fastify.post<{ Params: { channelId: string } }>(
    '/dm/channels/:channelId/voice/mls/init',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: MLS_WRITE_RATE },
    },
    (req, reply) =>
      handleInit(
        req,
        reply,
        ECHO_DM_REALM_SERVER_ID,
        trimEchoPathParam(req.params.channelId),
      ),
  );
  fastify.post<{ Params: { channelId: string } }>(
    '/dm/channels/:channelId/voice/mls/commit',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: MLS_WRITE_RATE },
    },
    (req, reply) =>
      handleCommit(
        fastify,
        req,
        reply,
        ECHO_DM_REALM_SERVER_ID,
        trimEchoPathParam(req.params.channelId),
      ),
  );
  fastify.post<{ Params: { channelId: string } }>(
    '/dm/channels/:channelId/voice/mls/proposal',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: MLS_WRITE_RATE },
    },
    (req, reply) =>
      handleProposal(
        fastify,
        req,
        reply,
        ECHO_DM_REALM_SERVER_ID,
        trimEchoPathParam(req.params.channelId),
      ),
  );

  // ---- Guild voice MLS ----
  fastify.get<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/voice/mls/group-info',
    { preHandler: [requireAuth, requireEchoStore] },
    (req, reply) =>
      handleGroupInfo(
        req,
        reply,
        trimEchoPathParam(req.params.serverId),
        trimEchoPathParam(req.params.channelId),
      ),
  );
  fastify.get<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/voice/mls/messages',
    { preHandler: [requireAuth, requireEchoStore] },
    (req, reply) =>
      handleMessages(
        req,
        reply,
        trimEchoPathParam(req.params.serverId),
        trimEchoPathParam(req.params.channelId),
      ),
  );
  fastify.post<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/voice/mls/init',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: MLS_WRITE_RATE },
    },
    (req, reply) =>
      handleInit(
        req,
        reply,
        trimEchoPathParam(req.params.serverId),
        trimEchoPathParam(req.params.channelId),
      ),
  );
  fastify.post<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/voice/mls/commit',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: MLS_WRITE_RATE },
    },
    (req, reply) =>
      handleCommit(
        fastify,
        req,
        reply,
        trimEchoPathParam(req.params.serverId),
        trimEchoPathParam(req.params.channelId),
      ),
  );
  fastify.post<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/voice/mls/proposal',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: MLS_WRITE_RATE },
    },
    (req, reply) =>
      handleProposal(
        fastify,
        req,
        reply,
        trimEchoPathParam(req.params.serverId),
        trimEchoPathParam(req.params.channelId),
      ),
  );
}
