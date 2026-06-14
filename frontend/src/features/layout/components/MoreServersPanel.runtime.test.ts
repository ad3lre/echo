// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  type App,
} from 'vue';
import { createPinia } from 'pinia';
import type { MoreServersMockServer } from '@/composables/useMoreServers';

function fixture(
  overrides: Partial<MoreServersMockServer> = {},
): MoreServersMockServer {
  return {
    id: 's1',
    name: 'Alpha Server',
    icon: '',
    members: '',
    online: '',
    description: '',
    tags: [],
    verified: false,
    ...overrides,
  };
}

const SERVERS: MoreServersMockServer[] = [
  fixture({ id: 's1', name: 'Alpha Server' }),
  fixture({ id: 's2', name: 'Beta Server' }),
];

vi.mock('@/composables/useMoreServers', () => ({
  useMoreServers: () => ({
    moreServersList: computed(() => SERVERS),
    moreServersCount: computed(() => SERVERS.length),
  }),
}));

import MoreServersPanel from '@/features/layout/components/MoreServersPanel.vue';

describe('MoreServersPanel runtime', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  function mountPanel(compact: boolean) {
    const Host = defineComponent({
      setup() {
        return () =>
          h(MoreServersPanel, {
            open: true,
            compact,
            pinned: false,
          });
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.use(createPinia());
    app.mount(container);
  }

  it('renders the panel shell and both servers in card view', async () => {
    mountPanel(false);
    await nextTick();
    expect(container!.querySelector('.more-servers-panel')).toBeTruthy();
    const text = container!.textContent ?? '';
    expect(text).toContain('Alpha Server');
    expect(text).toContain('Beta Server');
  });

  it('renders both servers in compact view', async () => {
    mountPanel(true);
    await nextTick();
    expect(container!.querySelector('.more-servers-panel')).toBeTruthy();
    // Compact rows render server icons; the name lives in title/alt attributes.
    const html = container!.innerHTML;
    expect(html).toContain('Alpha Server');
    expect(html).toContain('Beta Server');
    expect(container!.querySelectorAll('.compact-circle').length).toBe(2);
  });
});
