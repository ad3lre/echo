import { onScopeDispose, ref, watch, type Ref } from 'vue';
import type { useServerStore } from '@/features/layout/server';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/useEchoWorkspace';
import type {
  EchoWorkspaceEventSummary,
  EchoWorkspaceMyEventRsvp,
} from '@/features/layout/echoWorkspace/workspaceEchoApiSnapshot';
import {
  eventDetailViewFromRsvp,
  eventDetailViewFromSummary,
  type EventDetailView,
} from '@/features/server-events/eventDetailView';
import {
  mergeModalSearchParams,
  parseModalQueries,
} from '@/features/layout/urlNavigation';
import { putGuildEventRsvp } from '@/features/server-events/echoServerEventsHttp';
import { resolveGuildEventLocation } from '@/features/server-events/resolveGuildEventLocation';
import { applyEchoShellPath } from '@/features/layout/echoShellPathNavigation';
import { openExternal } from '@/platform/desktopBridge';
import {
  dispatchAppToastDetail,
  type AppToastAction,
} from '@/features/layout/failures/controllerMissingAction';

type GuildEventDetailTarget = { serverId: string; eventId: string };

/**
 * Guild event detail modal: open/close, two-way sync with the `guild_event*` URL
 * query (push/replace + popstate), RSVP submission with workspace re-hydrate, and
 * "open location" navigation (server channel / shell path / external / plain toast).
 *
 * Owns its own modal state and `window` popstate listener (registered on call,
 * removed on scope dispose), and runs an initial URL sync on setup. The returned
 * names match what AppLayout previously provided, so injection contracts are
 * unchanged.
 */
export function useGuildEventDetailModalController(deps: {
  myEventRsvps: Readonly<Ref<readonly EchoWorkspaceMyEventRsvp[]>>;
  upcomingEventsByServerId: Readonly<
    Ref<Record<string, readonly EchoWorkspaceEventSummary[]>>
  >;
  serverStore: Pick<ReturnType<typeof useServerStore>, 'servers'>;
  workspace: Pick<WorkspaceStateApi, 'loading' | 'categoriesByServer'>;
  hydrateEchoFromApi: () => Promise<void> | void;
  openServerSurface: (serverId: string, channelId?: string) => void;
  isDMPanelOpen: Ref<boolean>;
}) {
  const {
    myEventRsvps,
    upcomingEventsByServerId,
    serverStore,
    workspace,
    hydrateEchoFromApi,
    openServerSurface,
    isDMPanelOpen,
  } = deps;

  const isEventDetailModalOpen = ref(false);
  const eventDetailView = ref<EventDetailView | null>(null);
  const applyingEventDetailFromUrl = ref(false);

  /** Re-resolve the open event from the freshest workspace data (e.g. after an RSVP hydrate). */
  function resolveEventDetailView(
    serverId: string,
    eventId: string,
  ): EventDetailView | null {
    const rsvp = myEventRsvps.value.find((r) => r.id === eventId);
    if (rsvp) return eventDetailViewFromRsvp(rsvp);
    const summary = (upcomingEventsByServerId.value[serverId] ?? []).find(
      (e) => e.id === eventId,
    );
    if (summary) {
      const srv = serverStore.servers.find((s) => s.id === serverId);
      return eventDetailViewFromSummary(summary, {
        name: srv?.name ?? null,
        imageUrl: srv?.imageUrl ?? null,
      });
    }
    return null;
  }

  function guildEventDetailTargetFromLocation(): GuildEventDetailTarget | null {
    if (typeof window === 'undefined') return null;
    const mq = parseModalQueries(window.location.search);
    const serverId = mq.guildEventServerId?.trim();
    const eventId = mq.guildEventId?.trim();
    return serverId && eventId ? { serverId, eventId } : null;
  }

  function setGuildEventDetailUrl(
    payload: GuildEventDetailTarget | null,
    mode: 'push' | 'replace',
  ) {
    if (typeof window === 'undefined') return;
    const search = mergeModalSearchParams(
      window.location.search,
      payload
        ? {
            guild_event_server: payload.serverId,
            guild_event: payload.eventId,
          }
        : {
            guild_event_server: null,
            guild_event: null,
          },
    );
    const next = `${window.location.pathname}${search}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next === current) return;
    if (mode === 'replace') window.history.replaceState(null, '', next);
    else window.history.pushState(null, '', next);
  }

  function closeGuildEventDetailModal(opts?: { syncUrl?: boolean }) {
    isEventDetailModalOpen.value = false;
    eventDetailView.value = null;
    if (opts?.syncUrl !== false && !applyingEventDetailFromUrl.value) {
      setGuildEventDetailUrl(null, 'replace');
    }
  }

  function openGuildEventDetail(
    payload: GuildEventDetailTarget,
    opts?: { syncUrl?: boolean },
  ) {
    const view = resolveEventDetailView(payload.serverId, payload.eventId);
    if (!view) {
      // Fall back to plain navigation if we can't resolve event details.
      isDMPanelOpen.value = false;
      navigateGuildEventOpenPayload({ serverId: payload.serverId });
      return;
    }
    eventDetailView.value = view;
    isEventDetailModalOpen.value = true;
    if (opts?.syncUrl !== false && !applyingEventDetailFromUrl.value) {
      setGuildEventDetailUrl(payload, 'push');
    }
  }

  function applyGuildEventDetailQueryFromLocation() {
    const target = guildEventDetailTargetFromLocation();
    applyingEventDetailFromUrl.value = true;
    try {
      if (!target) {
        closeGuildEventDetailModal({ syncUrl: false });
        return;
      }
      const view = resolveEventDetailView(target.serverId, target.eventId);
      if (!view) return;
      eventDetailView.value = view;
      isEventDetailModalOpen.value = true;
    } finally {
      applyingEventDetailFromUrl.value = false;
    }
  }

  async function submitGuildEventRsvp(payload: {
    serverId: string;
    eventId: string;
    status: 'going' | 'declined';
    closeDetailOnDecline?: boolean;
  }) {
    try {
      /* Cookie session: bearer token is unused by `echoFetch` (see `transport.ts`). */
      await putGuildEventRsvp(
        '',
        payload.serverId,
        payload.eventId,
        payload.status,
      );
      await hydrateEchoFromApi();
      if (payload.status === 'declined' && payload.closeDetailOnDecline) {
        closeGuildEventDetailModal();
        return;
      }
      // Keep an open detail modal in sync with the refreshed counts/RSVP state.
      if (isEventDetailModalOpen.value && eventDetailView.value) {
        const refreshed = resolveEventDetailView(
          payload.serverId,
          payload.eventId,
        );
        if (refreshed) {
          eventDetailView.value = refreshed;
        } else if (payload.status === 'declined') {
          // Declining drops the event out of myEventRsvps; reflect locally.
          eventDetailView.value = {
            ...eventDetailView.value,
            userRsvp: 'declined',
          };
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dispatchAppToastDetail({
        message: msg.includes('EVENT_FULL')
          ? 'This event is at capacity.'
          : 'Could not update RSVP. Try again.',
        durationMs: 4000,
      });
    }
  }

  function onEventDetailPopState() {
    applyGuildEventDetailQueryFromLocation();
  }

  function toastPlainGuildEventLocation(text: string, urls: readonly string[]) {
    const actions: AppToastAction[] = [
      {
        id: 'copy',
        label: 'Copy',
        kind: 'primary',
        run: () => {
          void navigator.clipboard?.writeText(text);
        },
      },
    ];
    const first = urls[0];
    if (first) {
      actions.push({
        id: 'open',
        label: 'Open link',
        run: () => {
          void openExternal(first);
        },
      });
    }
    dispatchAppToastDetail({
      title: 'Event location',
      message: text.length > 720 ? `${text.slice(0, 720)}…` : text,
      subtitle: first,
      actions,
      severity: 'info',
      durationMs: 14_000,
    });
  }

  function navigateGuildEventOpenPayload(payload: {
    serverId: string;
    channelId?: string | null;
    customLocation?: string | null;
  }) {
    const base = import.meta.env.BASE_URL || '/';
    const res = resolveGuildEventLocation({
      eventServerId: payload.serverId,
      channelId: payload.channelId,
      customLocation: payload.customLocation,
      base,
    });
    switch (res.kind) {
      case 'server_channel':
        openServerSurface(res.serverId, res.channelId);
        break;
      case 'shell_path': {
        const ok = applyEchoShellPath(res.pathWithSearch);
        if (!ok) {
          dispatchAppToastDetail({
            title: 'Open this location',
            message:
              'Finish loading Echo, then try again — or paste the link into your browser bar.',
            severity: 'warning',
          });
        }
        break;
      }
      case 'external':
        void openExternal(res.url);
        break;
      case 'plain':
        toastPlainGuildEventLocation(res.text, res.detectedUrls);
        break;
      case 'fallback_server': {
        const cats = workspace.categoriesByServer.value[res.serverId] ?? [];
        let cid = '';
        outer: for (const cat of cats) {
          for (const ch of cat.channels ?? []) {
            if (ch.type === 'text') {
              cid = ch.id;
              break outer;
            }
          }
        }
        openServerSurface(res.serverId, cid || undefined);
        break;
      }
      default:
        break;
    }
  }

  // Sync modal state to the URL on load and on browser back/forward.
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', onEventDetailPopState);
    applyGuildEventDetailQueryFromLocation();
    onScopeDispose(() => {
      window.removeEventListener('popstate', onEventDetailPopState);
    });
  }

  // Re-apply once workspace data lands so a deep-linked event resolves.
  watch(
    [
      myEventRsvps,
      upcomingEventsByServerId,
      () => serverStore.servers.length,
      () => workspace.loading.value,
    ],
    () => {
      if (!guildEventDetailTargetFromLocation()) return;
      applyGuildEventDetailQueryFromLocation();
    },
    { deep: true, flush: 'post' },
  );

  return {
    isEventDetailModalOpen,
    eventDetailView,
    openGuildEventDetail,
    closeGuildEventDetailModal,
    submitGuildEventRsvp,
    navigateGuildEventOpenPayload,
  };
}
