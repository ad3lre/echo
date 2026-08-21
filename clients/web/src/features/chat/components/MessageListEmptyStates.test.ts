// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, type App } from 'vue';

vi.mock('@/features/chat/components/DiscordChannelImportWidget.vue', () => ({
  default: { name: 'DiscordChannelImportWidget', render: () => null },
}));

import MessageListEmptyStates from './MessageListEmptyStates.vue';

type EmptyStatesProps = {
  showNoServersYet: boolean;
  showEmptyChannelHint: boolean;
  showDiscordImportWidget: boolean;
  onOpenExplore?: () => void;
  serverId?: string;
  channelId?: string;
  channelName?: string;
};

describe('MessageListEmptyStates', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = null;
    container = null;
    document.body.innerHTML = '';
  });

  function mountStates(props: EmptyStatesProps) {
    container = document.createElement('div');
    document.body.appendChild(container);
    const Host = defineComponent({
      setup() {
        return () => h(MessageListEmptyStates, props);
      },
    });
    app = createApp(Host);
    app.mount(container);
  }

  it('renders the empty-channel hint copy', () => {
    mountStates({
      showNoServersYet: false,
      showEmptyChannelHint: true,
      showDiscordImportWidget: false,
    });
    expect(
      container?.querySelector('[aria-label="No messages in this channel"]')
        ?.textContent,
    ).toContain('No messages here yet');
  });

  it('renders the no-servers CTA', () => {
    mountStates({
      showNoServersYet: true,
      showEmptyChannelHint: false,
      showDiscordImportWidget: false,
      onOpenExplore: () => {},
    });
    expect(
      container?.querySelector('[aria-label="No servers yet"]')?.textContent,
    ).toContain("You're not in any servers yet");
    expect(container?.querySelector('button')?.textContent).toContain(
      'Explore servers',
    );
  });
});
