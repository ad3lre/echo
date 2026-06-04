// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';

const h = vi.hoisted(() => ({
  putGuildEventRsvp: vi.fn(),
  dispatchAppToastDetail: vi.fn(),
  openExternal: vi.fn(),
  applyEchoShellPath: vi.fn(() => true),
  resolveGuildEventLocation: vi.fn(),
  eventDetailViewFromRsvp: vi.fn(),
  eventDetailViewFromSummary: vi.fn(),
}));

vi.mock('@/services/http/echoServerEventsHttp', () => ({
  putGuildEventRsvp: h.putGuildEventRsvp,
}));
vi.mock('@/utils/controllerMissingAction', () => ({
  dispatchAppToastDetail: h.dispatchAppToastDetail,
}));
vi.mock('@/platform/desktopBridge', () => ({ openExternal: h.openExternal }));
vi.mock('@/platform/desktopProductDeepLink', () => ({
  applyEchoShellPath: h.applyEchoShellPath,
}));
vi.mock('@/features/server-events/resolveGuildEventLocation', () => ({
  resolveGuildEventLocation: h.resolveGuildEventLocation,
}));
vi.mock('@/features/server-events/eventDetailView', () => ({
  eventDetailViewFromRsvp: h.eventDetailViewFromRsvp,
  eventDetailViewFromSummary: h.eventDetailViewFromSummary,
}));

import { useGuildEventDetailModalController } from './useGuildEventDetailModalController';

type Deps = Parameters<typeof useGuildEventDetailModalController>[0];

function makeView(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'e1',
    serverId: 's1',
    serverName: 'Srv',
    serverImageUrl: null,
    title: 'Launch',
    description: '',
    imageUrl: null,
    startsAt: '2026-06-01T00:00:00Z',
    endsAt: null,
    timezoneLabel: null,
    channelId: 'c1',
    channelName: 'general',
    customLocation: null,
    goingCount: 1,
    maxAttendees: null,
    userRsvp: 'going',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    myEventRsvps: ref([
      { id: 'e1', serverId: 's1' },
    ]) as unknown as Deps['myEventRsvps'],
    upcomingEventsByServerId: ref(
      {},
    ) as unknown as Deps['upcomingEventsByServerId'],
    serverStore: {
      servers: [{ id: 's1', name: 'Srv', imageUrl: null }],
    } as unknown as Deps['serverStore'],
    workspace: {
      loading: ref(false),
      categoriesByServer: ref({}),
    } as unknown as Deps['workspace'],
    hydrateEchoFromApi: vi.fn(),
    openServerSurface: vi.fn(),
    isDMPanelOpen: ref(false),
    ...overrides,
  };
}

function setUrl(search: string) {
  window.history.replaceState(null, '', `/${search}`);
}

describe('useGuildEventDetailModalController', () => {
  let scope: ReturnType<typeof effectScope>;

  beforeEach(() => {
    for (const fn of Object.values(h)) fn.mockReset();
    h.applyEchoShellPath.mockReturnValue(true);
    h.eventDetailViewFromRsvp.mockImplementation(() => makeView());
    h.eventDetailViewFromSummary.mockImplementation(() => makeView());
    setUrl('');
  });
  afterEach(() => scope?.stop());

  function mount(overrides: Partial<Deps> = {}) {
    const deps = makeDeps(overrides);
    scope = effectScope(true);
    const api = scope.run(() => useGuildEventDetailModalController(deps))!;
    return { api, deps };
  }

  it('opens the modal for a resolvable event and pushes the URL', () => {
    const { api } = mount();
    api.openGuildEventDetail({ serverId: 's1', eventId: 'e1' });
    expect(api.isEventDetailModalOpen.value).toBe(true);
    expect(api.eventDetailView.value).toMatchObject({ eventId: 'e1' });
    expect(window.location.search).toContain('guild_event=e1');
    expect(window.location.search).toContain('guild_event_server=s1');
  });

  it('falls back to navigation when the event cannot be resolved', () => {
    h.resolveGuildEventLocation.mockReturnValue({
      kind: 'server_channel',
      serverId: 's1',
      channelId: 'c1',
    });
    const { api, deps } = mount({
      myEventRsvps: ref([]) as unknown as Deps['myEventRsvps'],
    });
    api.openGuildEventDetail({ serverId: 's1', eventId: 'missing' });
    expect(api.isEventDetailModalOpen.value).toBe(false);
    expect(deps.isDMPanelOpen.value).toBe(false);
    expect(deps.openServerSurface).toHaveBeenCalledWith('s1', 'c1');
  });

  it('closing clears the modal and removes the URL query', () => {
    const { api } = mount();
    api.openGuildEventDetail({ serverId: 's1', eventId: 'e1' });
    expect(window.location.search).toContain('guild_event=e1');
    api.closeGuildEventDetailModal();
    expect(api.isEventDetailModalOpen.value).toBe(false);
    expect(api.eventDetailView.value).toBe(null);
    expect(window.location.search).not.toContain('guild_event');
  });

  it('submitGuildEventRsvp puts the RSVP and re-hydrates', async () => {
    h.putGuildEventRsvp.mockResolvedValue(undefined);
    const { api, deps } = mount();
    await api.submitGuildEventRsvp({
      serverId: 's1',
      eventId: 'e1',
      status: 'going',
    });
    expect(h.putGuildEventRsvp).toHaveBeenCalledWith('', 's1', 'e1', 'going');
    expect(deps.hydrateEchoFromApi).toHaveBeenCalledTimes(1);
  });

  it('declining with closeDetailOnDecline closes the modal', async () => {
    h.putGuildEventRsvp.mockResolvedValue(undefined);
    const { api } = mount();
    api.openGuildEventDetail({ serverId: 's1', eventId: 'e1' });
    await api.submitGuildEventRsvp({
      serverId: 's1',
      eventId: 'e1',
      status: 'declined',
      closeDetailOnDecline: true,
    });
    expect(api.isEventDetailModalOpen.value).toBe(false);
  });

  it('shows a toast when the RSVP request fails (capacity message)', async () => {
    h.putGuildEventRsvp.mockRejectedValue(new Error('EVENT_FULL'));
    const { api } = mount();
    await api.submitGuildEventRsvp({
      serverId: 's1',
      eventId: 'e1',
      status: 'going',
    });
    expect(h.dispatchAppToastDetail).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'This event is at capacity.' }),
    );
  });

  it('syncs an open modal from the URL on setup (deep link)', () => {
    setUrl('?guild_event_server=s1&guild_event=e1');
    const { api } = mount();
    expect(api.isEventDetailModalOpen.value).toBe(true);
    expect(api.eventDetailView.value).toMatchObject({ eventId: 'e1' });
  });

  it('re-applies the URL target on popstate', () => {
    const { api } = mount();
    expect(api.isEventDetailModalOpen.value).toBe(false);
    setUrl('?guild_event_server=s1&guild_event=e1');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(api.isEventDetailModalOpen.value).toBe(true);
  });

  it('navigateGuildEventOpenPayload routes plain locations to a toast', () => {
    h.resolveGuildEventLocation.mockReturnValue({
      kind: 'plain',
      text: 'Room 4B',
      detectedUrls: [],
    });
    const { api } = mount();
    api.navigateGuildEventOpenPayload({
      serverId: 's1',
      customLocation: 'Room 4B',
    });
    expect(h.dispatchAppToastDetail).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Event location' }),
    );
  });

  it('navigateGuildEventOpenPayload opens external links', () => {
    h.resolveGuildEventLocation.mockReturnValue({
      kind: 'external',
      url: 'https://example.com/event',
    });
    const { api } = mount();
    api.navigateGuildEventOpenPayload({ serverId: 's1' });
    expect(h.openExternal).toHaveBeenCalledWith('https://example.com/event');
  });

  it('removes the popstate listener when the scope is disposed', () => {
    const { api } = mount();
    scope.stop();
    setUrl('?guild_event_server=s1&guild_event=e1');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(api.isEventDetailModalOpen.value).toBe(false);
  });
});
