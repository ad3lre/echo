// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import ChannelAutocompletePopover from './ChannelAutocompletePopover.vue';

describe('ChannelAutocompletePopover runtime', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = null;
    container = null;
    document.body.innerHTML = '';
  });

  it('renders shared autocomplete classes and channel secondary text', async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(ChannelAutocompletePopover, {
            suggestions: [{ id: 'c1', name: 'voice-hangout', type: 'voice' }],
            selectedIndex: 0,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.use(createPinia());
    app.mount(container);
    await nextTick();

    const menu = document.body.querySelector('.channel-autocomplete-popover');
    expect(menu?.className).toContain('echo-autocomplete-menu');

    const row = document.body.querySelector('.channel-autocomplete-item');
    expect(row?.className).toContain('echo-autocomplete-item');
    expect(row?.className).toContain('channel-autocomplete-item--selected');
    expect(row?.textContent).toContain('voice-hangout');
    expect(row?.textContent).toContain('Voice channel');
  });

  it('shows empty state when suggestions list is empty', async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(ChannelAutocompletePopover, {
            suggestions: [],
            selectedIndex: 0,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.use(createPinia());
    app.mount(container);
    await nextTick();

    const empty = document.body.querySelector('.echo-autocomplete-empty');
    expect(empty?.textContent).toContain('No channels found');
  });
});
