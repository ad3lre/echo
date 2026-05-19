import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import {
  createEchoChannel,
  deleteEchoServerByOwner,
  getEchoServerCapabilitiesForUser,
  insertEchoAudit,
  listEchoServerNotificationLevelsForUser,
  listEchoCategories,
  listEchoChannelsForUser,
  listEchoServerMembers,
  setEchoMemberNickname,
  transferEchoServerOwnership,
  upsertEchoServerNotificationLevel,
  updateEchoServerPreferences,
  createEchoServerEvent,
  updateEchoServerEvent,
  cancelEchoServerEvent,
  setEchoServerEventRsvp,
  listEchoServerEventsForManagement,
} from '../../../domain/echoStore';
import {
  canUserCreateEchoChannel,
  isMemberOfServer,
} from '../../../domain/echoPermissions';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';
import { emitEchoAttentionSnapshotForUser } from '../../../services/echoAttentionRealtime';
import { clampEchoChannelName } from '../../../../../shared/echoChannelLimits';
import type { EchoServerNotificationLevel } from '../../../../../shared/types';
import { validateEchoEventCoverImageUrl } from '../../../services/storedMediaUrl';
import {
  deleteDiscordMirrorForEchoServerEvent,
  peekEchoServerEventDiscordPatchBaseline,
  syncDiscordMirrorForEchoServerEvent,
} from '../../../services/discordEchoServerEventMirror';

export default async function echoServerScopedRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/notification-preferences',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const levels = await listEchoServerNotificationLevelsForUser(
        pool,
        req.authUser!.id,
        [sid],
      );
      return reply.code(200).send({
        level: levels[sid] ?? 'mentions',
      });
    },
  );

  fastify.put<{
    Params: { serverId: string };
    Body: { level?: EchoServerNotificationLevel };
  }>(
    '/servers/:serverId/notification-preferences',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const level =
        typeof req.body?.level === 'string' ? req.body.level : undefined;
      if (!level) {
        return sendError(reply, 400, 'INVALID_BODY', 'level required');
      }
      const result = await upsertEchoServerNotificationLevel(
        pool,
        req.authUser!.id,
        sid,
        level,
      );
      if (result !== 'ok') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Invalid notification level',
        );
      }
      void emitEchoAttentionSnapshotForUser(pool, fastify.io, req.authUser!.id);
      return reply.code(204).send();
    },
  );

  fastify.patch<{
    Params: { serverId: string };
    Body: {
      name?: string;
      automodSpamEnabled?: boolean;
      bannerBlurEnabled?: boolean;
      bannerBlackoutEnabled?: boolean;
      iconUrl?: string;
      bannerUrl?: string;
      bannerPositionY?: number;
      listedInDirectory?: boolean;
      inviteJoinEnabled?: boolean;
      vanityCode?: string;
      description?: string;
      tags?: string[];
      raidProtectionEnabled?: boolean;
      raidJoinThresholdCount?: number;
      raidJoinWindowSeconds?: number;
      applicationsEnabled?: boolean;
      applicationForm?: unknown;
    };
  }>(
    '/servers/:serverId/preferences',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const body = {
        name: typeof req.body?.name === 'string' ? req.body.name : undefined,
        automodSpamEnabled:
          typeof req.body?.automodSpamEnabled === 'boolean'
            ? req.body.automodSpamEnabled
            : undefined,
        bannerBlurEnabled:
          typeof req.body?.bannerBlurEnabled === 'boolean'
            ? req.body.bannerBlurEnabled
            : undefined,
        bannerBlackoutEnabled:
          typeof req.body?.bannerBlackoutEnabled === 'boolean'
            ? req.body.bannerBlackoutEnabled
            : undefined,
        iconUrl:
          typeof req.body?.iconUrl === 'string' ? req.body.iconUrl : undefined,
        bannerUrl:
          typeof req.body?.bannerUrl === 'string'
            ? req.body.bannerUrl
            : undefined,
        bannerPositionY:
          typeof req.body?.bannerPositionY === 'number' &&
          Number.isFinite(req.body.bannerPositionY)
            ? Math.max(0, Math.min(100, req.body.bannerPositionY))
            : undefined,
        listedInDirectory:
          typeof req.body?.listedInDirectory === 'boolean'
            ? req.body.listedInDirectory
            : undefined,
        inviteJoinEnabled:
          typeof req.body?.inviteJoinEnabled === 'boolean'
            ? req.body.inviteJoinEnabled
            : undefined,
        vanityCode:
          typeof req.body?.vanityCode === 'string'
            ? req.body.vanityCode
            : undefined,
        description:
          typeof req.body?.description === 'string'
            ? req.body.description
            : undefined,
        tags: Array.isArray(req.body?.tags)
          ? req.body.tags.filter(
              (tag): tag is string => typeof tag === 'string',
            )
          : undefined,
        raidProtectionEnabled:
          typeof req.body?.raidProtectionEnabled === 'boolean'
            ? req.body.raidProtectionEnabled
            : undefined,
        raidJoinThresholdCount:
          typeof req.body?.raidJoinThresholdCount === 'number'
            ? req.body.raidJoinThresholdCount
            : undefined,
        raidJoinWindowSeconds:
          typeof req.body?.raidJoinWindowSeconds === 'number'
            ? req.body.raidJoinWindowSeconds
            : undefined,
        applicationsEnabled:
          typeof req.body?.applicationsEnabled === 'boolean'
            ? req.body.applicationsEnabled
            : undefined,
        applicationForm: req.body?.applicationForm,
      };
      const r = await updateEchoServerPreferences(
        pool,
        sid,
        req.authUser!.id,
        body,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to update server preferences',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Server not found');
      if (r === 'vanity_taken')
        return sendError(
          reply,
          409,
          'VANITY_TAKEN',
          'That vanity URL is already in use',
        );
      if (r === 'invalid_body')
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'No valid fields or value too large',
        );
      const auditId = await insertEchoAudit(
        pool,
        sid,
        req.authUser!.id,
        'server.update_preferences',
        'server',
        sid,
        {
          nameUpdated: body.name !== undefined,
          automodSpamEnabled: body.automodSpamEnabled,
          bannerBlurEnabled: body.bannerBlurEnabled,
          bannerBlackoutEnabled: body.bannerBlackoutEnabled,
          iconUpdated: body.iconUrl !== undefined,
          bannerUpdated: body.bannerUrl !== undefined,
          listedInDirectory: body.listedInDirectory,
          inviteJoinEnabled: body.inviteJoinEnabled,
          descriptionUpdated: body.description !== undefined,
          tagsUpdated: body.tags !== undefined,
          raidProtectionEnabled: body.raidProtectionEnabled,
          raidJoinThresholdCount: body.raidJoinThresholdCount,
          raidJoinWindowSeconds: body.raidJoinWindowSeconds,
          applicationsEnabled: body.applicationsEnabled,
          applicationFormUpdated: body.applicationForm !== undefined,
        },
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'server_updated', version: auditId, serverId: sid },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );

  fastify.patch<{
    Params: { serverId: string; userId: string };
    Body: { nickname?: string };
  }>(
    '/servers/:serverId/members/:userId/nickname',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const targetUserId = trimEchoPathParam(req.params.userId);
      const nickname =
        typeof req.body?.nickname === 'string' ? req.body.nickname : '';
      if (!targetUserId) {
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid member');
      }
      const r = await setEchoMemberNickname(
        pool,
        sid,
        req.authUser!.id,
        targetUserId,
        nickname,
      );
      if (r === 'not_member')
        return sendError(reply, 404, 'NOT_FOUND', 'Member not found');
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot change this nickname',
        );
      if (r === 'invalid')
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Nickname too long (max 32 characters)',
        );
      const auditId = await insertEchoAudit(
        pool,
        sid,
        req.authUser!.id,
        'member.nickname',
        'user',
        targetUserId,
        {
          cleared: !nickname.trim(),
        },
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'server_updated', version: auditId, serverId: sid },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/channels',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const channels = await listEchoChannelsForUser(
        pool,
        sid,
        req.authUser!.id,
      );
      return reply.code(200).send({ channels });
    },
  );

  fastify.post<{
    Params: { serverId: string };
    Body: {
      name?: string;
      type?: string;
      categoryId?: string;
      iconKey?: string;
    };
  }>(
    '/servers/:serverId/channels',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const allowed = await canUserCreateEchoChannel(
        pool,
        sid,
        req.authUser!.id,
      );
      if (!allowed)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to create channels',
        );
      const name =
        clampEchoChannelName(
          typeof req.body?.name === 'string' ? req.body.name : 'channel',
        ) || 'channel';
      const type =
        req.body?.type === 'voice'
          ? 'voice'
          : req.body?.type === 'forum'
            ? 'forum'
            : 'text';
      let categoryId =
        typeof req.body?.categoryId === 'string'
          ? req.body.categoryId.trim()
          : '';
      if (!categoryId) {
        const cats = await listEchoCategories(pool, sid);
        categoryId =
          cats.find((c) => c.name === 'Text Channels')?.id ?? cats[0]?.id ?? '';
      }
      if (!categoryId)
        return sendError(reply, 400, 'INVALID_BODY', 'No category on server');
      const iconKey =
        typeof req.body?.iconKey === 'string' ? req.body.iconKey : undefined;
      const channelId = await createEchoChannel(
        pool,
        sid,
        name,
        type,
        categoryId,
        iconKey,
      );
      if (channelId === 'invalid_category') {
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid categoryId');
      }
      const auditId = await insertEchoAudit(
        pool,
        sid,
        req.authUser!.id,
        'channel.create',
        'channel',
        channelId,
        {
          name,
        },
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'channel_tree_changed', version: auditId, serverId: sid },
        { serverId: sid },
      );
      return reply.code(201).send({ channelId });
    },
  );

  fastify.post<{ Params: { serverId: string }; Body: { newOwnerId?: string } }>(
    '/servers/:serverId/transfer-ownership',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const newOwnerId =
        typeof req.body?.newOwnerId === 'string'
          ? req.body.newOwnerId.trim()
          : '';
      if (!newOwnerId)
        return sendError(reply, 400, 'INVALID_BODY', 'newOwnerId required');
      const r = await transferEchoServerOwnership(
        pool,
        sid,
        req.authUser!.id,
        newOwnerId,
      );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Server not found');
      if (r === 'forbidden') {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Only the server owner can transfer ownership',
        );
      }
      if (r === 'invalid_target') {
        return sendError(
          reply,
          400,
          'INVALID_TARGET',
          'New owner must be another server member',
        );
      }
      if (r === 'target_banned') {
        return sendError(
          reply,
          400,
          'INVALID_TARGET',
          'Cannot transfer ownership to a banned user',
        );
      }
      const auditId = await insertEchoAudit(
        pool,
        sid,
        req.authUser!.id,
        'server.transfer_ownership',
        'server',
        sid,
        {
          previousOwnerId: req.authUser!.id,
          newOwnerId,
        },
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'server_updated',
          version: auditId,
          serverId: sid,
          userId: newOwnerId,
        },
        { serverId: sid, userId: newOwnerId },
      );
      return reply.code(204).send();
    },
  );

  fastify.delete<{ Params: { serverId: string } }>(
    '/servers/:serverId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const r = await deleteEchoServerByOwner(pool, sid, req.authUser!.id);
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Server not found');
      if (r === 'forbidden') {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Only the server owner can delete this server',
        );
      }
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'workspace_invalidated',
          version: Date.now().toString(),
          serverId: sid,
          userId: req.authUser!.id,
        },
        { serverId: sid, userId: req.authUser!.id },
      );
      return reply.code(204).send();
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/events',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const caps = await getEchoServerCapabilitiesForUser(
        pool,
        sid,
        req.authUser!.id,
      );
      if (!caps.canManageServer) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Manage Server is required to list server events here.',
        );
      }
      const events = await listEchoServerEventsForManagement(pool, sid);
      return reply.code(200).send({ events });
    },
  );

  fastify.post<{
    Params: { serverId: string };
    Body: {
      title?: string;
      description?: string;
      imageUrl?: string;
      startsAt?: string;
      endsAt?: string;
      timezoneLabel?: string | null;
      channelId?: string | null;
      customLocation?: string | null;
      maxAttendees?: number | null;
      mirrorToDiscord?: boolean;
    };
  }>(
    '/servers/:serverId/events',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const caps = await getEchoServerCapabilitiesForUser(
        pool,
        sid,
        req.authUser!.id,
      );
      if (!caps.canManageServer) {
        return sendError(reply, 403, 'FORBIDDEN', 'Manage Server is required.');
      }
      const title = typeof req.body?.title === 'string' ? req.body.title : '';
      const startsRaw = req.body?.startsAt;
      const endsRaw = req.body?.endsAt;
      const startsAt =
        typeof startsRaw === 'string' && startsRaw.trim()
          ? new Date(startsRaw.trim())
          : null;
      const endsAt =
        typeof endsRaw === 'string' && endsRaw.trim()
          ? new Date(endsRaw.trim())
          : null;
      if (!startsAt || Number.isNaN(startsAt.getTime())) {
        return sendError(reply, 400, 'INVALID_BODY', 'startsAt required (ISO)');
      }
      if (!endsAt || Number.isNaN(endsAt.getTime())) {
        return sendError(reply, 400, 'INVALID_BODY', 'endsAt required (ISO)');
      }
      const imageNorm = validateEchoEventCoverImageUrl(
        typeof req.body?.imageUrl === 'string' ? req.body.imageUrl : '',
      );
      if (!imageNorm.ok) {
        return sendError(reply, 400, 'INVALID_BODY', imageNorm.message);
      }
      const mirrorToDiscord = req.body?.mirrorToDiscord === true;
      const created = await createEchoServerEvent(pool, {
        serverId: sid,
        creatorUserId: req.authUser!.id,
        title,
        description:
          typeof req.body?.description === 'string' ? req.body.description : '',
        imageUrl: imageNorm.value,
        startsAt,
        endsAt,
        timezoneLabel: null,
        channelId: req.body?.channelId ?? undefined,
        customLocation:
          typeof req.body?.customLocation === 'string'
            ? req.body.customLocation
            : req.body?.customLocation === null
              ? null
              : undefined,
        maxAttendees: null,
      });
      if (!created.ok) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          created.reason === 'bad_channel'
            ? 'channelId must belong to this server'
            : created.reason === 'bad_location'
              ? 'Use either channelId or customLocation, not both'
              : 'endsAt must be after startsAt',
        );
      }
      const auditId = await insertEchoAudit(
        pool,
        sid,
        req.authUser!.id,
        'echo.event_created',
        'event',
        created.id,
        { title: title.trim().slice(0, 200) },
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'workspace_invalidated',
          version: auditId,
          serverId: sid,
        },
        { serverId: sid },
      );
      const resBody: {
        id: string;
        discordMirror?: { ok: boolean; message?: string };
      } = { id: created.id };
      if (mirrorToDiscord) {
        const m = await syncDiscordMirrorForEchoServerEvent(pool, fastify.log, {
          serverId: sid,
          eventId: created.id,
          mirrorToDiscord: true,
          prePatch: null,
        });
        resBody.discordMirror = m.ok
          ? { ok: true }
          : { ok: false, message: m.message };
      }
      return reply.code(201).send(resBody);
    },
  );

  fastify.patch<{
    Params: { serverId: string; eventId: string };
    Body: {
      title?: string;
      description?: string;
      imageUrl?: string;
      startsAt?: string;
      endsAt?: string;
      timezoneLabel?: string | null;
      channelId?: string | null;
      customLocation?: string | null;
      maxAttendees?: number | null;
      mirrorToDiscord?: boolean;
    };
  }>(
    '/servers/:serverId/events/:eventId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const eventId = trimEchoPathParam(req.params.eventId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const caps = await getEchoServerCapabilitiesForUser(
        pool,
        sid,
        req.authUser!.id,
      );
      if (!caps.canManageServer) {
        return sendError(reply, 403, 'FORBIDDEN', 'Manage Server is required.');
      }
      const body = req.body ?? {};
      const patch: Parameters<typeof updateEchoServerEvent>[1] = {
        serverId: sid,
        eventId,
      };
      if (typeof body.title === 'string') patch.title = body.title;
      if (typeof body.description === 'string')
        patch.description = body.description;
      if (typeof body.imageUrl === 'string') {
        const imageNorm = validateEchoEventCoverImageUrl(body.imageUrl);
        if (!imageNorm.ok) {
          return sendError(reply, 400, 'INVALID_BODY', imageNorm.message);
        }
        patch.imageUrl = imageNorm.value;
      }
      if (typeof body.startsAt === 'string' && body.startsAt.trim()) {
        const d = new Date(body.startsAt.trim());
        if (!Number.isNaN(d.getTime())) patch.startsAt = d;
      }
      if (typeof body.endsAt === 'string' && body.endsAt.trim()) {
        const d = new Date(body.endsAt.trim());
        if (!Number.isNaN(d.getTime())) patch.endsAt = d;
      }
      if ('channelId' in body) patch.channelId = body.channelId;
      if ('customLocation' in body) patch.customLocation = body.customLocation;
      patch.timezoneLabel = null;
      patch.maxAttendees = null;

      const mirrorToDiscord = body.mirrorToDiscord === true;
      const prePatch = await peekEchoServerEventDiscordPatchBaseline(
        pool,
        sid,
        eventId,
      );

      const updated = await updateEchoServerEvent(pool, patch);
      if (!updated.ok) {
        if (updated.reason === 'not_found') {
          return sendError(reply, 404, 'NOT_FOUND', 'Event not found');
        }
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          updated.reason === 'bad_channel'
            ? 'channelId must belong to this server'
            : updated.reason === 'bad_location'
              ? 'Use either channelId or customLocation, not both'
              : 'endsAt must be after startsAt',
        );
      }
      const auditId = await insertEchoAudit(
        pool,
        sid,
        req.authUser!.id,
        'echo.event_updated',
        'event',
        eventId,
        {},
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'workspace_invalidated',
          version: auditId,
          serverId: sid,
        },
        { serverId: sid },
      );
      const syncRes = await syncDiscordMirrorForEchoServerEvent(
        pool,
        fastify.log,
        {
          serverId: sid,
          eventId,
          mirrorToDiscord,
          prePatch: prePatch ?? null,
        },
      );
      const out: { discordMirror?: { ok: boolean; message?: string } } = {};
      if (!syncRes.ok) {
        out.discordMirror = { ok: false, message: syncRes.message };
      } else if (mirrorToDiscord || prePatch?.discordScheduledEventId) {
        out.discordMirror = { ok: true };
      }
      return reply.code(200).send(out);
    },
  );

  fastify.post<{ Params: { serverId: string; eventId: string } }>(
    '/servers/:serverId/events/:eventId/cancel',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const eventId = trimEchoPathParam(req.params.eventId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const caps = await getEchoServerCapabilitiesForUser(
        pool,
        sid,
        req.authUser!.id,
      );
      if (!caps.canManageServer) {
        return sendError(reply, 403, 'FORBIDDEN', 'Manage Server is required.');
      }
      const ok = await cancelEchoServerEvent(pool, sid, eventId);
      if (!ok) {
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'Event not found or already cancelled',
        );
      }
      await deleteDiscordMirrorForEchoServerEvent(
        pool,
        fastify.log,
        sid,
        eventId,
      );
      const auditId = await insertEchoAudit(
        pool,
        sid,
        req.authUser!.id,
        'echo.event_cancelled',
        'event',
        eventId,
        {},
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'workspace_invalidated',
          version: auditId,
          serverId: sid,
        },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );

  fastify.put<{
    Params: { serverId: string; eventId: string };
    Body: { status?: 'going' | 'declined' };
  }>(
    '/servers/:serverId/events/:eventId/rsvp',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const eventId = trimEchoPathParam(req.params.eventId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const st = req.body?.status;
      if (st !== 'going' && st !== 'declined') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'status must be going or declined',
        );
      }
      const r = await setEchoServerEventRsvp(
        pool,
        sid,
        eventId,
        req.authUser!.id,
        st,
      );
      if (r === 'not_found') {
        return sendError(reply, 404, 'NOT_FOUND', 'Event not found');
      }
      if (r === 'not_member') {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      if (r === 'event_ended') {
        return sendError(reply, 400, 'INVALID_BODY', 'This event has ended');
      }
      if (r === 'cancelled') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'This event was cancelled',
        );
      }
      if (r === 'full') {
        return sendError(
          reply,
          409,
          'CONFLICT',
          'Event is at capacity',
          'EVENT_FULL',
        );
      }
      const auditId = await insertEchoAudit(
        pool,
        sid,
        req.authUser!.id,
        'echo.event_rsvp',
        'event',
        eventId,
        { status: st, userId: req.authUser!.id },
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'workspace_invalidated',
          version: auditId,
          serverId: sid,
        },
        { serverId: sid, userId: req.authUser!.id },
      );
      return reply.code(204).send();
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/capabilities',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      return reply
        .code(200)
        .send(
          await getEchoServerCapabilitiesForUser(pool, sid, req.authUser!.id),
        );
    },
  );
}
