// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import MentionAutocompletePopover from './MentionAutocompletePopover.vue';

describe('MentionAutocompletePopover runtime', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = null;
    container = null;
    document.body.innerHTML = '';
  });

  it('renders shared autocomplete classes and secondary alias text', async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(MentionAutocompletePopover, {
            suggestions: [
              {
                id: 'u1',
                name: 'Alice',
                aliases: ['alice_handle'],
                status: 'online',
              },
            ],
            selectedIndex: 0,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();

    const menu = document.body.querySelector('.mention-autocomplete-popover');
    expect(menu?.className).toContain('echo-autocomplete-menu');

    const row = document.body.querySelector('.mention-autocomplete-item');
    expect(row?.className).toContain('echo-autocomplete-item');
    expect(row?.className).toContain('mention-autocomplete-item--selected');
    expect(row?.textContent).toContain('Alice');
    expect(row?.textContent).toContain('@alice_handle');
  });

  it('shows empty state when suggestions list is empty', async () => {
    const suggestions = ref<any[]>([]);
    const Host = defineComponent({
      setup() {
        return () =>
          h(MentionAutocompletePopover, {
            suggestions: suggestions.value,
            selectedIndex: 0,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();

    const empty = document.body.querySelector('.echo-autocomplete-empty');
    expect(empty?.textContent).toContain('No people found');
  });
});
