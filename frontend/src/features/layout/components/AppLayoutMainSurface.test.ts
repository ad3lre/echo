// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import {
  LAYOUT_MAIN_SURFACE_KEY,
  type LayoutMainSurfaceContext,
} from '@/features/layout/layoutInjectionKeys';

const captured = vi.hoisted(() => ({
  attrs: new Map<string, Record<string, unknown>>(),
}));

/* `__esModule: true` lets Vue's defineAsyncComponent unwrap `.default`
 * from the vitest mock namespace (its proxy throws on unknown probes). */
function stubChild(name: string, testId: string) {
  return {
    __esModule: true,
    default: {
      name,
      inheritAttrs: false,
      setup(_: unknown, { attrs }: { attrs: Record<string, unknown> }) {
        captured.attrs.set(name, attrs);
        return () => h('div', { 'data-testid': testId });
      },
    },
  };
}

vi.mock('@/features/layout/components/AppLayoutInfoBanners.vue', () =>
  stubChild('AppLayoutInfoBanners', 'info-banners'),
);
vi.mock('@/features/layout/components/AppLayoutChatSurface.vue', () =>
  stubChild('AppLayoutChatSurface', 'chat-surface'),
);
vi.mock('@/features/layout/components/AppLayoutMembersColumn.vue', () =>
  stubChild('AppLayoutMembersColumn', 'members-column'),
);
vi.mock('@/features/layout/components/ServerDownGate.vue', () =>
  stubChild('ServerDownGate', 'server-down-gate'),
);
vi.mock('@/features/layout/components/InviteLandingView.vue', () =>
  stubChild('InviteLandingView', 'invite-landing'),
);
vi.mock('@/features/layout/components/WelcomeBackExploreGate.vue', () =>
  stubChild('WelcomeBackExploreGate', 'welcome-back-gate'),
);
vi.mock('@/features/layout/components/ExploreView.vue', () =>
  stubChild('ExploreView', 'explore-view'),
);

import AppLayoutMainSurface from './AppLayoutMainSurface.vue';

function makeCtx(
  overrides: Partial<LayoutMainSurfaceContext> = {},
): LayoutMainSurfaceContext {
  return {
    explorePageUnifiedScroll: ref(false),
    showServerDownGate: ref(false),
    serverDownGateBind: ref({
      checking: false,
      outageSinceMs: null,
      lastCheckedAtMs: null,
      detail: null,
      averageRecoverySeconds: 60,
      recoverySampleCount: 0,
    }),
    checkServerHealthNow: vi.fn(),
    inviteLandingActive: ref(false),
    inviteLandingPreview: ref(null),
    inviteLandingLoading: ref(false),
    inviteLandingError: ref(null),
    inviteLandingPersistBeforeOAuth: vi.fn(),
    isCompactShell: ref(false),
    mobileShellGoBack: vi.fn(() => true),
    openAuthModal: vi.fn(),
    welcomeBackExploreGate: ref(false),
    welcomeBackExploreMemberEmptyDirectory: ref(false),
    openAddServerModal: vi.fn(),
    onJoinServerFromShell: vi.fn(),
    exploreDiscoverableServers: ref([]),
    exploreDirectoryJoinBusy: ref(false),
    handleJoinDiscoverableServer: vi.fn(),
    ...overrides,
  };
}

/** Mount with the context provided; settles async child components. */
async function mountSurface(
  props: Record<string, unknown>,
  ctx: LayoutMainSurfaceContext,
  whileMounted: (container: HTMLDivElement) => void | Promise<void>,
) {
  const warnings: string[] = [];
  const errors: string[] = [];
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const container = document.createElement('div');
  document.body.appendChild(container);

  const app = createApp(AppLayoutMainSurface as never, props);
  app.provide(LAYOUT_MAIN_SURFACE_KEY, ctx);
  app.config.warnHandler = (msg) => {
    warnings.push(String(msg));
  };
  app.config.errorHandler = (err) => {
    errors.push(err instanceof Error ? err.message : String(err));
  };

  try {
    app.mount(container);
    // Async child components resolve their mocked dynamic imports off-microtask.
    await vi.dynamicImportSettled();
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      await nextTick();
    }
    await whileMounted(container);
  } finally {
    app.unmount();
    container.remove();
  }

  expect(warnings).toEqual([]);
  expect(errors).toEqual([]);
  expect(consoleWarn).not.toHaveBeenCalled();
  expect(consoleError).not.toHaveBeenCalled();
}

function has(container: HTMLElement, testId: string): boolean {
  return !!container.querySelector(`[data-testid="${testId}"]`);
}

afterEach(() => {
  captured.attrs.clear();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('AppLayoutMainSurface', () => {
  it('surface="chat" renders banners + chat surface without explore or members', async () => {
    await mountSurface({ surface: 'chat' }, makeCtx(), (c) => {
      expect(has(c, 'info-banners')).toBe(true);
      expect(has(c, 'chat-surface')).toBe(true);
      expect(has(c, 'explore-view')).toBe(false);
      expect(has(c, 'members-column')).toBe(false);
    });
  });

  it('membersColumn renders the members column after the chat surface', async () => {
    await mountSurface(
      { surface: 'chat', membersColumn: true },
      makeCtx(),
      (c) => {
        expect(has(c, 'chat-surface')).toBe(true);
        expect(has(c, 'members-column')).toBe(true);
      },
    );
  });

  it('surface="explore" renders ExploreView even when unified scroll is off', async () => {
    const ctx = makeCtx({ explorePageUnifiedScroll: ref(false) });
    await mountSurface({ surface: 'explore' }, ctx, (c) => {
      expect(has(c, 'explore-view')).toBe(true);
      expect(has(c, 'chat-surface')).toBe(false);
    });
  });

  it('auto surface follows explorePageUnifiedScroll', async () => {
    await mountSurface(
      {},
      makeCtx({ explorePageUnifiedScroll: ref(true) }),
      (c) => {
        expect(has(c, 'explore-view')).toBe(true);
        expect(has(c, 'chat-surface')).toBe(false);
      },
    );
    await mountSurface(
      { membersColumn: true },
      makeCtx({ explorePageUnifiedScroll: ref(false) }),
      (c) => {
        expect(has(c, 'explore-view')).toBe(false);
        expect(has(c, 'chat-surface')).toBe(true);
        expect(has(c, 'members-column')).toBe(true);
      },
    );
  });

  it('server-down gate wins over invite landing and wires retry', async () => {
    const ctx = makeCtx({
      showServerDownGate: ref(true),
      inviteLandingActive: ref(true),
    });
    await mountSurface({ surface: 'chat' }, ctx, (c) => {
      expect(has(c, 'server-down-gate')).toBe(true);
      expect(has(c, 'invite-landing')).toBe(false);
      expect(has(c, 'chat-surface')).toBe(false);
      const attrs = captured.attrs.get('ServerDownGate');
      expect(attrs?.checking).toBe(false);
      expect(attrs?.averageRecoverySeconds).toBe(60);
      (attrs?.onRetry as () => void)();
      expect(ctx.checkServerHealthNow).toHaveBeenCalledTimes(1);
    });
  });

  it('invite landing forwards preview state and auth handlers', async () => {
    const preview = { name: 'Echo HQ' };
    const ctx = makeCtx({
      inviteLandingActive: ref(true),
      inviteLandingPreview: ref(
        preview,
      ) as LayoutMainSurfaceContext['inviteLandingPreview'],
      inviteLandingLoading: ref(true),
      inviteLandingError: ref('nope'),
      isCompactShell: ref(true),
      welcomeBackExploreGate: ref(true),
    });
    await mountSurface({ surface: 'chat' }, ctx, (c) => {
      expect(has(c, 'invite-landing')).toBe(true);
      expect(has(c, 'welcome-back-gate')).toBe(false);
      const attrs = captured.attrs.get('InviteLandingView');
      expect(attrs?.preview).toEqual(preview);
      expect(attrs?.loading).toBe(true);
      expect(attrs?.error).toBe('nope');
      expect(attrs?.['show-mobile-back']).toBe(true);
      (attrs?.['onLogInEcho'] as () => void)();
      expect(ctx.openAuthModal).toHaveBeenCalledWith({ entry: 'echo' });
      (attrs?.['onSignInPasskey'] as () => void)();
      expect(ctx.openAuthModal).toHaveBeenCalledWith({
        entry: 'social',
        passkey: true,
      });
      (attrs?.['onPersistBeforeOauth'] as () => void)();
      expect(ctx.inviteLandingPersistBeforeOAuth).toHaveBeenCalledTimes(1);
    });
  });

  it('welcome-back gate forwards member-empty-directory and server handlers', async () => {
    const ctx = makeCtx({
      welcomeBackExploreGate: ref(true),
      welcomeBackExploreMemberEmptyDirectory: ref(true),
    });
    await mountSurface({ surface: 'chat' }, ctx, (c) => {
      expect(has(c, 'welcome-back-gate')).toBe(true);
      expect(has(c, 'chat-surface')).toBe(false);
      const attrs = captured.attrs.get('WelcomeBackExploreGate');
      expect(attrs?.['member-empty-directory']).toBe(true);
      (attrs?.['onCreateServer'] as () => void)();
      expect(ctx.openAddServerModal).toHaveBeenCalledWith('create');
      (attrs?.['onJoinServer'] as (link?: string) => void)('inv');
      expect(ctx.onJoinServerFromShell).toHaveBeenCalledWith('inv');
    });
  });

  it('explore view forwards directory rows and join handlers', async () => {
    const rows = [{ id: '1', name: 'Server', pfp: '' }];
    const ctx = makeCtx({
      explorePageUnifiedScroll: ref(true),
      exploreDiscoverableServers: ref(rows),
      exploreDirectoryJoinBusy: ref(true),
    });
    await mountSurface({}, ctx, (c) => {
      expect(has(c, 'explore-view')).toBe(true);
      const attrs = captured.attrs.get('ExploreView');
      expect(attrs?.['discoverable-servers']).toEqual(rows);
      expect(attrs?.['directory-join-busy']).toBe(true);
      (attrs?.['onJoinSuggested'] as (p: unknown) => void)({
        id: '1',
        name: 'Server',
        pfp: '',
      });
      expect(ctx.handleJoinDiscoverableServer).toHaveBeenCalledWith({
        id: '1',
        name: 'Server',
        pfp: '',
      });
      (attrs?.onBack as () => void)();
      expect(ctx.mobileShellGoBack).toHaveBeenCalledTimes(1);
    });
  });

  it('throws without the LAYOUT_MAIN_SURFACE_KEY context', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    document.body.appendChild(container);
    const app = createApp(AppLayoutMainSurface as never, { surface: 'chat' });
    app.config.warnHandler = () => {};
    app.config.errorHandler = (err) => {
      errors.push(err instanceof Error ? err.message : String(err));
    };
    try {
      app.mount(container);
    } finally {
      app.unmount();
      container.remove();
    }
    expect(errors.some((m) => m.includes('LAYOUT_MAIN_SURFACE_KEY'))).toBe(
      true,
    );
  });
});
