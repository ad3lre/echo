import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({
  echoFetch: vi.fn(),
  trimEchoPathSegment: vi.fn((raw: string) => raw.trim()),
}));

const presenceClient = vi.hoisted(() => ({
  echoOutboundPresenceActiveClient: vi.fn(() => 'desktop'),
}));

vi.mock('./transport', () => transport);
vi.mock('@/api/echo/transport', () => transport);
vi.mock('@/utils/echoOutboundPresenceClient', () => presenceClient);

import {
  fetchEchoAttentionSummary,
  putEchoServerNotificationPreference,
} from './attention';
import {
  fetchEchoBannedWordsConfig,
  updateEchoBannedWordsConfig,
} from './bannedWords';
import { postEchoBugReport } from './bugReports';
import {
  deleteEchoServerCategory,
  fetchEchoServerCategories,
  patchEchoServerCategory,
  postEchoServerCategory,
} from './categories';
import {
  createEchoChannelWebhook,
  deleteEchoChannelWebhook,
  listEchoChannelWebhooks,
  regenerateEchoChannelWebhookToken,
} from './channelWebhooks';
import {
  deleteEchoDiscordBridge,
  getEchoDiscordBridge,
  getEchoDiscordBridgeChannels,
  getEchoDiscordBridgeGuilds,
  postEchoDiscordBridgeCategoryBulkApply,
  postEchoDiscordBridgeCategoryBulkClear,
  putEchoDiscordBridge,
} from './discordBridge';
import {
  fetchEchoDiscordImportState,
  postEchoDiscordForumImportMessages,
  postEchoDiscordImportBind,
  postEchoDiscordImportMessages,
  postEchoDiscordImportPostSetup,
  postEchoDiscordImportRefreshFromExport,
  postEchoDiscordImportRunFull,
  postEchoDiscordImportStep,
} from './discordImport';
import {
  fetchDiscordVoiceMirrorRoster,
  getDiscordVoiceMirrorCategorySettings,
  getDiscordVoiceMirrorVoiceChannelSettings,
  putDiscordVoiceMirrorCategorySettings,
  putDiscordVoiceMirrorVoiceChannelSettings,
} from './discordVoiceMirror';
import {
  getEchoE2eeDevices,
  getEchoE2eePairingState,
  postEchoE2eeDeviceRegister,
  postEchoE2eePairingRespond,
  postEchoE2eePairingStart,
  postEchoE2eePrekeysRefresh,
  postEchoRevokeE2eeDevice,
} from './e2ee';
import {
  deleteEchoServerCustomEmoji,
  fetchEchoEmojiMarketPacks,
  fetchEchoServerEmojiLibrary,
  fetchEchoUserEmojiLibrary,
  patchEchoEmojiPackMeta,
  patchEchoServerCustomEmojiName,
  postEchoCreateCustomEmojiPack,
  postEchoEmojiUsage,
  postEchoImportMarketEmojiPack,
  postEchoResolveEmojiTokens,
  postEchoServerCustomEmoji,
} from './emoji';
import {
  createEchoForumPost,
  listEchoForumPosts,
  patchEchoForumPost,
} from './forums';
import {
  fetchEchoChannelMessage,
  fetchEchoChannelMessages,
  fetchEchoChannelMessageSearch,
  fetchEchoChannelPins,
  fetchEchoServerMessageSearch,
  postEchoChannelMessage,
  putEchoChannelReadState,
} from './messages';
import { fetchEchoAuditLog, fetchEchoServerBans } from './moderation';
import {
  deleteEchoUserRingtone,
  fetchEchoUserRingtones,
  registerEchoUserRingtone,
} from './ringtones';
import { postEchoReportMessage, postEchoReportUser } from './safetyReports';
import {
  fetchEchoSelfRolesConfig,
  fetchEchoSelfRolesPanel,
  patchEchoSelfRolesConfig,
  postEchoSelfRoleToggle,
} from './selfAssignableRoles';
import {
  deleteEchoServer,
  patchEchoMemberNickname,
  postEchoLeaveServer,
  postEchoModerationAction,
  postEchoTransferServerOwnership,
} from './serverAdmin';
import {
  fetchEchoJoinApplicationPreview,
  fetchEchoServerApplications,
  fetchEchoServerApplicationSettings,
  postEchoServerApplicationApprove,
  postEchoServerApplicationReject,
  postEchoServerApplicationSubmit,
  postEchoServerInviteCode,
} from './serverApplications';
import {
  cancelGuildEvent,
  createGuildEvent,
  fetchGuildEventsForManagement,
  putGuildEventRsvp,
  updateGuildEvent,
} from './serverEvents';
import {
  createEchoServer,
  fetchEchoServerMembers,
  fetchEchoServers,
  fetchEchoVanityAvailability,
  patchEchoServerPreferences,
} from './serverLifecycle';
import {
  deleteEchoGroupDmMember,
  deleteEchoUnblockUser,
  fetchEchoBlockedUsers,
  fetchEchoDmMessageRequests,
  fetchEchoDmThreads,
  fetchEchoFriendRequests,
  fetchEchoFriends,
  fetchEchoMutualFriends,
  fetchEchoPresenceBatch,
  fetchEchoUserPublicProfile,
  patchEchoGroupDm,
  postEchoAcceptFriend,
  postEchoAcceptMessageRequest,
  postEchoAddGroupDmMembers,
  postEchoBlockUser,
  postEchoCancelFriendRequest,
  postEchoDeclineFriend,
  postEchoFriendRequest,
  postEchoIgnoreMessageRequest,
  postEchoLeaveGroupDm,
  postEchoOpenDm,
  postEchoOpenGroupDm,
  postEchoPresenceHttp,
  postEchoRemoveFriend,
} from './social';
import {
  fetchStageYoutubeStream,
  startStageYoutubeStream,
  stopStageYoutubeStream,
  updateStageYoutubeStreamLayout,
} from './stageYoutube';
import {
  createEchoTicket,
  deleteEchoTicket,
  fetchEchoTicketByChannelId,
  fetchEchoTicketById,
  fetchEchoTicketConfig,
  fetchEchoTickets,
  patchEchoTicket,
  patchEchoTicketConfig,
} from './tickets';
import {
  fetchEchoVcActivityPopularity,
  fetchEchoYoutubeWatchTogetherUsage,
  postEchoVcActivityOpen,
  postEchoYoutubeWatchTogetherUsage,
} from './vcActivities';
import {
  deleteEchoStageRequestSpeak,
  fetchEchoStageSpeakRequests,
  fetchEchoVoiceParticipants,
  parseEchoLiveKitSessionResponse,
  postEchoDmLivekitSession,
  postEchoStageRequestSpeak,
  postEchoVoiceJoin,
  postEchoVoiceLeave,
  postEchoVoiceLivekitSession,
  postEchoVoiceModerate,
  postEchoVoiceQosSample,
  resolveEchoStageSpeakRequest,
} from './voice';
import {
  fetchEchoYoutubePopular,
  fetchEchoYoutubeRelated,
  fetchEchoYoutubeVcSearch,
} from './youtubeVc';

function lastCall() {
  return transport.echoFetch.mock.calls.at(-1)!;
}

function expectLast(path: string, init?: RequestInit) {
  const call = lastCall();
  expect(call[1]).toBe(path);
  if (init !== undefined) expect(call[2]).toEqual(init);
}

function bodyOf(call = lastCall()) {
  return JSON.parse(String(call[2]?.body));
}

describe('Echo REST helper wrappers', () => {
  beforeEach(() => {
    transport.echoFetch.mockReset();
    transport.echoFetch.mockResolvedValue({});
    transport.trimEchoPathSegment.mockClear();
    presenceClient.echoOutboundPresenceActiveClient.mockClear();
  });

  it('covers server, category, notification, moderation, and admin endpoints', async () => {
    await fetchEchoAttentionSummary('tok');
    expectLast('/attention/summary');

    await putEchoServerNotificationPreference('tok', ' srv/1 ', 'muted');
    expectLast('/servers/srv%2F1/notification-preferences', {
      method: 'PUT',
      body: JSON.stringify({ level: 'muted' }),
    });

    await fetchEchoBannedWordsConfig('tok', 'srv/1');
    expectLast('/servers/srv%2F1/banned-words/config');
    await updateEchoBannedWordsConfig('tok', 'srv/1', { enabled: true });
    expectLast('/servers/srv%2F1/banned-words/config', {
      method: 'PUT',
      body: JSON.stringify({ enabled: true }),
    });

    await postEchoBugReport('tok', {
      description: 'A thing broke',
      client: { userAgent: 'test' },
      trace: { entries: [] },
      attachmentUrls: ['https://cdn/bug.png'],
    });
    expectLast('/bug-reports', {
      method: 'POST',
      body: JSON.stringify({
        description: 'A thing broke',
        client: { userAgent: 'test' },
        trace: { entries: [] },
        attachmentUrls: ['https://cdn/bug.png'],
      }),
    });

    await createEchoServer('tok', { name: 'Echo', iconUrl: 'https://i' });
    expectLast('/servers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Echo', iconUrl: 'https://i' }),
    });
    await fetchEchoServers('tok');
    expectLast('/servers');
    await fetchEchoServerMembers('tok', 'srv/1');
    expectLast('/servers/srv%2F1/members');
    await patchEchoServerPreferences('tok', 'srv/1', {
      listedInDirectory: true,
    });
    expectLast('/servers/srv%2F1/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ listedInDirectory: true }),
    });
    await fetchEchoVanityAvailability('tok', ' srv/1 ', 'space cats');
    expectLast('/servers/srv%2F1/vanity-availability?code=space+cats');

    await fetchEchoServerCategories('tok', 'srv/1');
    expectLast('/servers/srv%2F1/categories');
    await postEchoServerCategory('tok', 'srv/1', { name: 'General' });
    expectLast('/servers/srv%2F1/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'General' }),
    });
    await patchEchoServerCategory('tok', 'srv/1', 'cat/1', {
      siblingIndex: 2,
    });
    expectLast('/servers/srv%2F1/categories/cat%2F1', {
      method: 'PATCH',
      body: JSON.stringify({ siblingIndex: 2 }),
    });
    await deleteEchoServerCategory('tok', 'srv/1', 'cat/1');
    expectLast('/servers/srv%2F1/categories/cat%2F1', { method: 'DELETE' });

    await fetchEchoAuditLog('tok', 'srv/1', 20, { actorId: ' user/1 ' });
    expectLast('/servers/srv%2F1/audit?limit=20&actorId=user%2F1');
    await fetchEchoServerBans('tok', 'srv/1');
    expectLast('/servers/srv%2F1/bans');

    await postEchoModerationAction('tok', 'srv/1', {
      action: 'kick',
      targetUserId: 'u1',
    });
    expectLast('/servers/srv%2F1/moderation', {
      method: 'POST',
      body: JSON.stringify({ action: 'kick', targetUserId: 'u1' }),
    });
    await patchEchoMemberNickname('tok', 'srv/1', 'user/1', 'Ada');
    expectLast('/servers/srv%2F1/members/user%2F1/nickname', {
      method: 'PATCH',
      body: JSON.stringify({ nickname: 'Ada' }),
    });
    await postEchoTransferServerOwnership('tok', 'srv/1', 'user/2');
    expectLast('/servers/srv%2F1/transfer-ownership', {
      method: 'POST',
      body: JSON.stringify({ newOwnerId: 'user/2' }),
    });
    await deleteEchoServer('tok', 'srv/1');
    expectLast('/servers/srv%2F1', { method: 'DELETE' });
    await postEchoLeaveServer(null, 'srv/1');
    expectLast('/servers/srv%2F1/leave', { method: 'POST' });
  });

  it('covers webhooks, Discord bridge/import, voice mirror, and YouTube activity endpoints', async () => {
    await listEchoChannelWebhooks('tok', 'srv/1', 'chan/1');
    expectLast('/servers/srv%2F1/channels/chan%2F1/webhooks');
    await createEchoChannelWebhook('tok', 'srv/1', 'chan/1', { name: 'Bot' });
    expectLast('/servers/srv%2F1/channels/chan%2F1/webhooks', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bot' }),
    });
    await deleteEchoChannelWebhook('tok', 'srv/1', 'chan/1', 'wh/1');
    expectLast('/servers/srv%2F1/channels/chan%2F1/webhooks/wh%2F1', {
      method: 'DELETE',
    });
    await regenerateEchoChannelWebhookToken('tok', 'srv/1', 'chan/1', 'wh/1');
    expectLast(
      '/servers/srv%2F1/channels/chan%2F1/webhooks/wh%2F1/regenerate-token',
      { method: 'POST', body: '{}' },
    );

    await getEchoDiscordBridge('tok', 'srv', 'chan');
    expectLast('/servers/srv/channels/chan/discord-bridge');
    await putEchoDiscordBridge('tok', 'srv', 'chan', {
      inboundEnabled: true,
      outboundEnabled: false,
    });
    expectLast('/servers/srv/channels/chan/discord-bridge', {
      method: 'PUT',
      body: JSON.stringify({ inboundEnabled: true, outboundEnabled: false }),
    });
    await deleteEchoDiscordBridge('tok', 'srv', 'chan');
    expectLast('/servers/srv/channels/chan/discord-bridge', {
      method: 'DELETE',
    });
    await getEchoDiscordBridgeGuilds('tok', 'srv', 'chan');
    expectLast('/servers/srv/channels/chan/discord-bridge/discord-guilds');
    await getEchoDiscordBridgeChannels('tok', 'srv', 'chan', 'guild 1');
    expectLast(
      '/servers/srv/channels/chan/discord-bridge/discord-channels?discordGuildId=guild+1',
    );
    await postEchoDiscordBridgeCategoryBulkApply('tok', 'srv', 'cat', {
      inboundEnabled: true,
      outboundEnabled: true,
    });
    expectLast('/servers/srv/categories/cat/discord-bridge/bulk-apply', {
      method: 'POST',
      body: JSON.stringify({ inboundEnabled: true, outboundEnabled: true }),
    });
    await postEchoDiscordBridgeCategoryBulkClear('tok', 'srv', 'cat');
    expectLast('/servers/srv/categories/cat/discord-bridge/bulk-clear', {
      method: 'POST',
    });

    await fetchEchoDiscordImportState('tok', 'srv');
    expectLast('/servers/srv/discord-import');
    await postEchoDiscordImportStep('tok', 'srv', 'roles', { force: true });
    expectLast('/servers/srv/discord-import', {
      method: 'POST',
      body: JSON.stringify({ step: 'roles', force: true }),
    });
    await postEchoDiscordImportBind('tok', 'srv', 'guild');
    expectLast('/servers/srv/discord-import/bind', {
      method: 'POST',
      body: JSON.stringify({ discordGuildId: 'guild' }),
    });
    await postEchoDiscordImportRunFull('tok', 'srv', {
      discordGuildId: ' guild ',
    });
    expectLast('/servers/srv/discord-import/run-full', {
      method: 'POST',
      body: JSON.stringify({ discordGuildId: 'guild' }),
    });
    await postEchoDiscordImportPostSetup('tok', 'srv', {
      syncAllChannels: true,
      messageLimit: 10,
    });
    expectLast('/servers/srv/discord-import/post-setup', {
      method: 'POST',
      body: JSON.stringify({ syncAllChannels: true, messageLimit: 10 }),
    });
    await postEchoDiscordImportRefreshFromExport('tok', 'srv');
    expectLast('/servers/srv/discord-import/refresh-from-export', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await postEchoDiscordImportMessages('tok', 'srv', 'chan', { limit: 50 });
    expectLast('/servers/srv/channels/chan/discord-import-messages', {
      method: 'POST',
      body: JSON.stringify({ limit: 50 }),
    });
    await postEchoDiscordForumImportMessages('tok', 'srv', 'forum', {
      limit: 25,
    });
    expectLast('/servers/srv/forums/forum/discord-import-messages', {
      method: 'POST',
      body: JSON.stringify({ limit: 25 }),
    });

    await fetchDiscordVoiceMirrorRoster('tok', 'srv');
    expectLast('/servers/srv/discord-voice-mirror/roster');
    await getDiscordVoiceMirrorCategorySettings('tok', 'srv', 'cat');
    expectLast('/servers/srv/categories/cat/discord-voice-mirror');
    await putDiscordVoiceMirrorCategorySettings('tok', 'srv', 'cat', {
      enabled: true,
      discordCategoryId: '',
    });
    expectLast('/servers/srv/categories/cat/discord-voice-mirror', {
      method: 'PUT',
      body: JSON.stringify({ enabled: true, discordCategoryId: '' }),
    });
    await getDiscordVoiceMirrorVoiceChannelSettings('tok', 'srv', 'chan');
    expectLast('/servers/srv/channels/chan/discord-voice-mirror');
    await putDiscordVoiceMirrorVoiceChannelSettings('tok', 'srv', 'chan', {
      enabled: false,
    });
    expectLast('/servers/srv/channels/chan/discord-voice-mirror', {
      method: 'PUT',
      body: JSON.stringify({ enabled: false }),
    });

    await fetchEchoVcActivityPopularity('tok');
    expectLast('/vc-activities/popularity');
    await postEchoVcActivityOpen('tok', 'youtube_watch_together' as never);
    expectLast('/vc-activities/youtube_watch_together/open', {
      method: 'POST',
    });
    await fetchEchoYoutubeWatchTogetherUsage('tok');
    expectLast('/vc-activities/youtube/usage');
    await postEchoYoutubeWatchTogetherUsage('tok', 12);
    expectLast('/vc-activities/youtube/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elapsedSec: 12 }),
    });

    await fetchEchoYoutubeVcSearch(null, '  lo fi  ');
    expectLast('/youtube/search?q=lo+fi', { method: 'GET' });
    await fetchEchoYoutubePopular(null, ' de ');
    expectLast('/youtube/popular?regionCode=de', { method: 'GET' });
    await fetchEchoYoutubeRelated(null, ' video id ');
    expectLast('/youtube/related?videoId=video+id', { method: 'GET' });
  });

  it('covers emoji, forum, and message helpers including trust-boundary parsing', async () => {
    transport.echoFetch.mockResolvedValueOnce({ packs: [] });
    await expect(fetchEchoEmojiMarketPacks({ q: ' cats ' })).resolves.toEqual({
      packs: [],
    });
    expectLast('/emoji-market/packs?q=cats');
    await fetchEchoServerEmojiLibrary('tok', 'srv');
    expectLast('/servers/srv/emoji-library');
    await fetchEchoUserEmojiLibrary('tok');
    expectLast('/users/me/emoji-library');
    await postEchoResolveEmojiTokens('tok', ['e1']);
    expectLast('/emoji/resolve', {
      method: 'POST',
      body: JSON.stringify({ ids: ['e1'] }),
    });
    await postEchoImportMarketEmojiPack('tok', 'srv', 'pack');
    expectLast('/servers/srv/emoji-packs/import-market', {
      method: 'POST',
      body: JSON.stringify({ marketPackId: 'pack' }),
    });
    await postEchoCreateCustomEmojiPack('tok', 'srv', {
      name: 'Cats',
      description: 'cat emojis',
    });
    expectLast('/servers/srv/emoji-packs/custom', {
      method: 'POST',
      body: JSON.stringify({ name: 'Cats', description: 'cat emojis' }),
    });
    await patchEchoEmojiPackMeta('tok', 'srv', 'pack/1', {
      listedInMarket: true,
    });
    expectLast('/servers/srv/emoji-packs/pack%2F1', {
      method: 'PATCH',
      body: JSON.stringify({ listedInMarket: true }),
    });
    await postEchoServerCustomEmoji('tok', 'srv', 'pack', {
      name: 'wave',
      animated: false,
      imageUrl: 'https://cdn/e.png',
    });
    expectLast('/servers/srv/emoji-packs/pack/emojis', {
      method: 'POST',
      body: JSON.stringify({
        name: 'wave',
        animated: false,
        imageUrl: 'https://cdn/e.png',
      }),
    });
    await deleteEchoServerCustomEmoji('tok', 'srv', 'pack', 'emoji/1');
    expectLast('/servers/srv/emoji-packs/pack/emojis/emoji%2F1', {
      method: 'DELETE',
    });
    await patchEchoServerCustomEmojiName(
      'tok',
      'srv',
      'pack',
      'emoji',
      'wave2',
    );
    expectLast('/servers/srv/emoji-packs/pack/emojis/emoji', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'wave2' }),
    });
    await postEchoEmojiUsage('tok', 'srv', 'emoji');
    expectLast('/servers/srv/emoji-usage', {
      method: 'POST',
      body: JSON.stringify({ emojiId: 'emoji' }),
    });

    await listEchoForumPosts('tok', 'forum/1', {
      sort: 'creation_date',
      includeArchived: true,
      limit: 5,
    });
    expectLast(
      '/channels/forum%2F1/forum/posts?sort=creation_date&includeArchived=true&limit=5',
      { method: 'GET' },
    );
    await createEchoForumPost('tok', 'forum/1', { content: 'hello' });
    expectLast('/channels/forum%2F1/forum/posts', {
      method: 'POST',
      body: JSON.stringify({ content: 'hello' }),
    });
    await patchEchoForumPost('tok', 'post/1', { locked: true });
    expectLast('/channels/post%2F1/forum/post', {
      method: 'PATCH',
      body: JSON.stringify({ locked: true }),
    });

    transport.echoFetch.mockResolvedValueOnce({ messages: [{ id: 'm1' }] });
    await expect(
      fetchEchoChannelMessages('tok', ' chan/1 ', {
        before: ' m0 ',
        limit: 20,
      }),
    ).resolves.toEqual({ messages: [{ id: 'm1' }] });
    expectLast('/channels/chan%2F1/messages?before=m0&limit=20');

    transport.echoFetch.mockResolvedValueOnce({ message: { id: 'm1' } });
    await expect(
      fetchEchoChannelMessage('tok', 'chan', ' m1 '),
    ).resolves.toEqual({ message: { id: 'm1' } });
    expectLast('/channels/chan/messages/m1');

    transport.echoFetch.mockResolvedValueOnce({
      messageIds: ['m1', 2, 'm2'],
    });
    await expect(fetchEchoChannelPins('tok', ' chan ')).resolves.toEqual({
      messageIds: ['m1', 'm2'],
    });
    expectLast('/channels/chan/pins');

    await putEchoChannelReadState('tok', ' chan ', ' m2 ');
    expectLast('/channels/chan/read-state', {
      method: 'PUT',
      body: JSON.stringify({ lastReadMessageId: 'm2' }),
    });

    transport.echoFetch.mockResolvedValueOnce({
      message: { id: 'm3' },
      idempotentReplay: true,
    });
    await expect(
      postEchoChannelMessage('tok', ' chan ', { content: 'hello', id: 'c1' }),
    ).resolves.toEqual({
      message: { id: 'm3' },
      idempotentReplay: true,
    });
    expectLast('/channels/chan/messages');
    expect(bodyOf()).toMatchObject({
      content: 'hello',
      id: 'c1',
      channelId: 'chan',
    });

    transport.echoFetch.mockResolvedValueOnce({ messages: [] });
    await fetchEchoServerMessageSearch('tok', ' srv ', { q: 'needle' });
    expectLast('/servers/srv/messages/search?q=needle');
    transport.echoFetch.mockResolvedValueOnce({ messages: [] });
    await fetchEchoChannelMessageSearch('tok', ' chan ', { authorId: 'u1' });
    expectLast('/channels/chan/messages/search?authorId=u1');

    transport.echoFetch.mockResolvedValueOnce({ nope: [] });
    await expect(fetchEchoChannelMessages('tok', 'chan')).rejects.toThrow(
      'expected "messages" array',
    );
  });

  it('covers applications, events, tickets, ringtones, reports, self roles, and E2EE endpoints', async () => {
    await fetchEchoJoinApplicationPreview('tok', ' srv ');
    expectLast('/servers/srv/join-application-preview');
    await fetchEchoServerApplicationSettings('tok', ' srv ');
    expectLast('/servers/srv/application-settings');
    await fetchEchoServerApplications('tok', ' srv ', 'all');
    expectLast('/servers/srv/applications?status=all');
    await postEchoServerInviteCode('tok', ' srv ', { skipsApplication: true });
    expectLast('/servers/srv/invite-codes', {
      method: 'POST',
      body: JSON.stringify({ skipsApplication: true }),
    });
    await postEchoServerApplicationSubmit('tok', ' srv ', {
      source: 'directory',
      answers: { a: 1 },
    });
    expectLast('/servers/srv/applications', {
      method: 'POST',
      body: JSON.stringify({ source: 'directory', answers: { a: 1 } }),
    });
    await postEchoServerApplicationApprove('tok', ' srv ', ' app/1 ');
    expectLast('/servers/srv/applications/app%2F1/approve', {
      method: 'POST',
    });
    await postEchoServerApplicationReject('tok', ' srv ', ' app/1 ');
    expectLast('/servers/srv/applications/app%2F1/reject', {
      method: 'POST',
      body: JSON.stringify({ note: '' }),
    });

    transport.echoFetch.mockResolvedValueOnce({ events: [{ id: 'event-1' }] });
    await expect(fetchGuildEventsForManagement('tok', 'srv')).resolves.toEqual([
      { id: 'event-1' },
    ]);
    expectLast('/servers/srv/events');
    transport.echoFetch.mockResolvedValueOnce({});
    await expect(fetchGuildEventsForManagement('tok', 'srv')).resolves.toEqual(
      [],
    );
    await createGuildEvent('tok', 'srv', {
      title: 'Town hall',
      startsAt: '2026-06-01T12:00:00Z',
      endsAt: '2026-06-01T13:00:00Z',
    });
    expectLast('/servers/srv/events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Town hall',
        startsAt: '2026-06-01T12:00:00Z',
        endsAt: '2026-06-01T13:00:00Z',
      }),
    });
    await updateGuildEvent('tok', 'srv', 'event/1', { title: 'Updated' });
    expectLast('/servers/srv/events/event%2F1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    await cancelGuildEvent('tok', 'srv', 'event/1');
    expectLast('/servers/srv/events/event%2F1/cancel', { method: 'POST' });
    await putGuildEventRsvp('tok', 'srv', 'event/1', 'going');
    expectLast('/servers/srv/events/event%2F1/rsvp', {
      method: 'PUT',
      body: JSON.stringify({ status: 'going' }),
    });

    await fetchEchoTicketConfig('tok', ' srv ');
    expectLast('/servers/srv/ticket-config');
    await patchEchoTicketConfig('tok', ' srv ', { enabled: true } as never);
    expectLast('/servers/srv/ticket-config', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
    });
    await createEchoTicket('tok', ' srv ', { subject: 'Help' });
    expectLast('/servers/srv/tickets', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Help' }),
    });
    await fetchEchoTickets('tok', ' srv ', { status: 'open', mine: true });
    expectLast('/servers/srv/tickets?status=open&mine=true');
    await fetchEchoTicketById('tok', ' srv ', ' ticket/1 ');
    expectLast('/servers/srv/tickets/ticket%2F1');
    await fetchEchoTicketByChannelId('tok', ' srv ', ' chan/1 ');
    expectLast('/servers/srv/ticket-by-channel/chan%2F1');
    await patchEchoTicket('tok', ' srv ', ' ticket/1 ', { status: 'closed' });
    expectLast('/servers/srv/tickets/ticket%2F1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'closed' }),
    });
    await deleteEchoTicket('tok', ' srv ', ' ticket/1 ');
    expectLast('/servers/srv/tickets/ticket%2F1', { method: 'DELETE' });

    await fetchEchoUserRingtones(null);
    expectLast('/ringtones', { method: 'GET' });
    await registerEchoUserRingtone(null, {
      label: 'Ping',
      storageKey: 'ringtones/u/ping.mp3',
      publicUrl: 'https://cdn/ping.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 123,
    });
    expectLast('/ringtones', {
      method: 'POST',
      body: JSON.stringify({
        label: 'Ping',
        storageKey: 'ringtones/u/ping.mp3',
        publicUrl: 'https://cdn/ping.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 123,
      }),
    });
    await deleteEchoUserRingtone(null, 'ring/1');
    expectLast('/ringtones/ring%2F1', { method: 'DELETE' });

    await postEchoReportUser('tok', { targetUserId: 'u1', reason: 'spam' });
    expectLast('/reports/user', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: 'u1', reason: 'spam' }),
    });
    await postEchoReportMessage('tok', { messageId: 'm1', channelId: 'c1' });
    expectLast('/reports/message', {
      method: 'POST',
      body: JSON.stringify({ messageId: 'm1', channelId: 'c1' }),
    });

    await fetchEchoSelfRolesConfig('tok', ' srv ');
    expectLast('/servers/srv/self-roles-config');
    await patchEchoSelfRolesConfig('tok', ' srv ', { enabled: true } as never);
    expectLast('/servers/srv/self-roles-config', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
    });
    await fetchEchoSelfRolesPanel('tok', ' srv ');
    expectLast('/servers/srv/self-roles-panel');
    transport.echoFetch.mockResolvedValueOnce({ categories: [] });
    await expect(
      postEchoSelfRoleToggle('tok', ' srv ', 'role', true),
    ).resolves.toEqual({ categories: [] });
    transport.echoFetch.mockResolvedValueOnce({});
    await expect(
      postEchoSelfRoleToggle('tok', ' srv ', 'role', false),
    ).resolves.toBeNull();

    await postEchoE2eeDeviceRegister(null, { deviceId: 'd1' } as never);
    expectLast('/e2ee/devices/register', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'd1' }),
    });
    await postEchoE2eePrekeysRefresh(null, {
      deviceId: 'd1',
      oneTimePrekeys: [],
    });
    expectLast('/e2ee/prekeys/refresh', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'd1', oneTimePrekeys: [] }),
    });
    await getEchoE2eeDevices(null);
    expectLast('/e2ee/devices', { method: 'GET' });
    await postEchoRevokeE2eeDevice(null, 'dev/1');
    expectLast('/e2ee/devices/dev%2F1/revoke', { method: 'POST' });
    await postEchoE2eePairingStart(null);
    expectLast('/e2ee/pairing/start', { method: 'POST' });
    await getEchoE2eePairingState(null, 'pair/1');
    expectLast('/e2ee/pairing/pair%2F1', { method: 'GET' });
    await postEchoE2eePairingRespond(null, 'pair/1', { ciphertext: 'abc' });
    expectLast('/e2ee/pairing/pair%2F1/respond', {
      method: 'POST',
      body: JSON.stringify({ ciphertext: 'abc' }),
    });
  });

  it('covers social and presence endpoints', async () => {
    const signal = new AbortController().signal;
    await fetchEchoUserPublicProfile('tok', ' user/1 ', { signal });
    expectLast('/users/user%2F1/profile', { signal });
    await postEchoOpenDm('tok', 'peer', { signal });
    expectLast('/dm/open', {
      method: 'POST',
      body: JSON.stringify({ peerUserId: 'peer' }),
      signal,
    });
    await postEchoOpenGroupDm('tok', {
      memberUserIds: ['u1'],
      name: undefined,
    });
    expectLast('/dm/group/open');
    expect(bodyOf()).toEqual({ memberUserIds: ['u1'], name: '' });
    await deleteEchoGroupDmMember('tok', 'chan/1', 'user/1');
    expectLast('/dm/group/chan%2F1/members/user%2F1', { method: 'DELETE' });
    await postEchoLeaveGroupDm('tok', 'chan/1');
    expectLast('/dm/group/chan%2F1/leave', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await postEchoAddGroupDmMembers('tok', 'chan/1', {
      memberUserIds: ['u2'],
    });
    expectLast('/dm/group/chan%2F1/members', {
      method: 'POST',
      body: JSON.stringify({ memberUserIds: ['u2'] }),
    });
    await patchEchoGroupDm('tok', 'chan/1', { name: 'Crew', pfp: 'https://p' });
    expectLast('/dm/group/chan%2F1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Crew', pfp: 'https://p' }),
    });

    transport.echoFetch.mockResolvedValueOnce({ threads: [] });
    await expect(fetchEchoDmThreads('tok')).resolves.toEqual({ threads: [] });
    expectLast('/dm/threads');
    await fetchEchoDmMessageRequests('tok');
    expectLast('/dm/message-requests');
    await postEchoAcceptMessageRequest('tok', 'req/1');
    expectLast('/dm/message-requests/req%2F1/accept', { method: 'POST' });
    await postEchoIgnoreMessageRequest('tok', 'req/1');
    expectLast('/dm/message-requests/req%2F1/ignore', { method: 'POST' });

    await fetchEchoBlockedUsers('tok');
    expectLast('/blocks');
    await postEchoBlockUser('tok', 'user/2');
    expectLast('/blocks', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: 'user/2' }),
    });
    await deleteEchoUnblockUser('tok', 'user/2');
    expectLast('/blocks/user%2F2', { method: 'DELETE' });

    await fetchEchoFriends('tok');
    expectLast('/friends');
    await postEchoFriendRequest('tok', 'peer');
    expectLast('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ peerId: 'peer' }),
    });
    await postEchoAcceptFriend('tok', 'peer');
    expectLast('/friends/accept', {
      method: 'POST',
      body: JSON.stringify({ peerId: 'peer' }),
    });
    await fetchEchoFriendRequests('tok');
    expectLast('/friends/requests');
    await postEchoDeclineFriend('tok', 'peer');
    expectLast('/friends/decline', {
      method: 'POST',
      body: JSON.stringify({ peerId: 'peer' }),
    });
    await postEchoCancelFriendRequest('tok', 'peer');
    expectLast('/friends/cancel', {
      method: 'POST',
      body: JSON.stringify({ peerId: 'peer' }),
    });
    await postEchoRemoveFriend('tok', 'peer');
    expectLast('/friends/remove', {
      method: 'POST',
      body: JSON.stringify({ peerId: 'peer' }),
    });
    await fetchEchoMutualFriends('tok', 'peer/1');
    expectLast('/friends/mutual?peerId=peer%2F1');

    await postEchoPresenceHttp('tok', 'online');
    expectLast('/presence', {
      method: 'POST',
      body: JSON.stringify({ status: 'online', client: 'desktop' }),
    });
    expect(presenceClient.echoOutboundPresenceActiveClient).toHaveBeenCalled();

    expect(await fetchEchoPresenceBatch('tok', [' ', ''])).toEqual({
      presence: {},
      presenceClient: {},
    });
    transport.echoFetch.mockResolvedValueOnce({
      presence: { u1: 'online', u2: 'bogus' },
      presenceClient: { u1: 'mobile', u3: 'desktop' },
      lastOnlineAt: { u1: '2026-06-01T00:00:00Z' },
    });
    await expect(
      fetchEchoPresenceBatch('tok', ['u1', 'u1', ' u2 ']),
    ).resolves.toEqual({
      presence: { u1: 'online' },
      presenceClient: { u1: 'mobile' },
      lastOnlineAt: { u1: '2026-06-01T00:00:00Z' },
    });
    expectLast('/presence?ids=u1,u2');
  });

  it('covers voice and stage media endpoints', async () => {
    await postEchoVoiceJoin('tok', 'srv', 'chan');
    expectLast('/servers/srv/channels/chan/voice/join', { method: 'POST' });
    await postEchoVoiceLeave('tok', 'srv');
    expectLast('/servers/srv/voice/leave', { method: 'POST' });
    await fetchEchoVoiceParticipants('tok', 'srv', 'chan');
    expectLast('/servers/srv/channels/chan/voice/participants');

    expect(
      parseEchoLiveKitSessionResponse({
        url: 'wss://lk',
        token: 'lk-token',
        roomName: 'room',
        bitrateBps: 64000,
        voiceE2ee: { required: true, epochId: 123 },
      }),
    ).toEqual({
      url: 'wss://lk',
      token: 'lk-token',
      roomName: 'room',
      bitrateBps: 64000,
      voiceE2ee: { required: true, epochId: null },
    });
    expect(() => parseEchoLiveKitSessionResponse(null)).toThrow(
      'expected object',
    );
    expect(() => parseEchoLiveKitSessionResponse({ url: 'wss://lk' })).toThrow(
      'missing url, token, or roomName',
    );

    transport.echoFetch.mockRejectedValueOnce(new Error('drop qos'));
    postEchoVoiceQosSample('tok', 'srv', 'chan', {
      latencyMs: 1,
      jitterMs: 2,
      packetLossPct: 0.1,
    });
    expectLast('/servers/srv/channels/chan/voice/qos-sample', {
      method: 'POST',
      body: JSON.stringify({ latencyMs: 1, jitterMs: 2, packetLossPct: 0.1 }),
    });
    await Promise.resolve();

    transport.echoFetch.mockResolvedValueOnce({
      url: 'wss://lk',
      token: 'lk-token',
      roomName: 'room',
    });
    await expect(
      postEchoVoiceLivekitSession('tok', 'srv', 'chan', {
        e2eeDeviceId: ' dev ',
      }),
    ).resolves.toMatchObject({ bitrateBps: null });
    expectLast('/servers/srv/channels/chan/voice/livekit-session', {
      method: 'POST',
      body: JSON.stringify({ e2eeDeviceId: 'dev' }),
    });

    transport.echoFetch.mockResolvedValueOnce({
      url: 'wss://lk',
      token: 'lk-token',
      roomName: 'dm-room',
    });
    await postEchoDmLivekitSession('tok', 'dm/1');
    expectLast('/dm/channels/dm%2F1/voice/livekit-session', {
      method: 'POST',
    });

    await postEchoStageRequestSpeak('tok', 'srv', 'stage');
    expectLast('/servers/srv/channels/stage/stage/request-speak', {
      method: 'POST',
    });
    await deleteEchoStageRequestSpeak('tok', 'srv', 'stage');
    expectLast('/servers/srv/channels/stage/stage/request-speak', {
      method: 'DELETE',
    });
    await fetchEchoStageSpeakRequests('tok', 'srv', 'stage');
    expectLast('/servers/srv/channels/stage/stage/speak-requests');
    await resolveEchoStageSpeakRequest('tok', 'srv', 'stage', 'user/1', true);
    expectLast('/servers/srv/channels/stage/stage/speak-requests/user%2F1', {
      method: 'POST',
      body: JSON.stringify({ approve: true }),
    });
    await postEchoVoiceModerate(null, 'srv', {
      action: 'move',
      targetUserId: 'u1',
      targetChannelId: 'voice',
    });
    expectLast('/servers/srv/voice/moderate', {
      method: 'POST',
      body: JSON.stringify({
        action: 'move',
        targetUserId: 'u1',
        targetChannelId: 'voice',
      }),
    });

    transport.echoFetch.mockResolvedValueOnce({ stream: { active: false } });
    await expect(
      fetchStageYoutubeStream('tok', 'srv', 'stage'),
    ).resolves.toEqual({ active: false });
    expectLast('/servers/srv/channels/stage/stage/youtube');
    transport.echoFetch.mockResolvedValueOnce({ stream: { active: true } });
    await expect(
      startStageYoutubeStream('tok', 'srv', 'stage', { title: 'Live' }),
    ).resolves.toEqual({ active: true });
    expectLast('/servers/srv/channels/stage/stage/youtube/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Live' }),
    });
    await stopStageYoutubeStream('tok', 'srv', 'stage');
    expectLast('/servers/srv/channels/stage/stage/youtube/stop', {
      method: 'POST',
    });
    await updateStageYoutubeStreamLayout('tok', 'srv', 'stage', 'spotlight');
    expectLast('/servers/srv/channels/stage/stage/youtube/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: 'spotlight' }),
    });
  });
});
