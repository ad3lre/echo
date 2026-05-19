// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import MessageActionBar from './MessageActionBar.vue';
import type { MessageWithAuthor } from '@shared/types';

const baseMessage: MessageWithAuthor = {
  id: 'm1',
  authorId: 'u2',
  content: 'hello',
  timestamp: '2026-05-16T12:00:00.000Z',
  author: { id: 'u2', name: 'Other', avatar: '' },
};

describe('MessageActionBar shift moderation actions', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  async function mountBar(opts: {
    isOwnMessage?: boolean;
    showModActions?: boolean;
    shiftPressed?: boolean;
  }) {
    const Host = defineComponent({
      setup() {
        const shiftPressed = ref(opts.shiftPressed ?? false);
        return () =>
          h(MessageActionBar, {
            message: baseMessage,
            quickReactionRow: [],
            parseSingleEmojiForReactions: (e: string) => e,
            isOwnMessage: opts.isOwnMessage ?? false,
            showModActions: opts.showModActions ?? false,
            shiftPressed: shiftPressed.value,
          });
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();
  }

  function visibleActionTitles(): string[] {
    return Array.from(
      container?.querySelectorAll('.msg-action-btn[title]') ?? [],
    )
      .filter((el) => getComputedStyle(el as HTMLElement).display !== 'none')
      .map((el) => el.getAttribute('title') ?? '');
  }

  it('hides moderation actions without Shift', async () => {
    await mountBar({ showModActions: true, shiftPressed: false });
    expect(visibleActionTitles().some((t) => t.includes('hold Shift'))).toBe(
      false,
    );
  });

  it('shows moderation actions when Shift is held', async () => {
    await mountBar({ showModActions: true, shiftPressed: true });
    const titles = visibleActionTitles();
    expect(titles).toContain('Delete message (hold Shift)');
    expect(titles).toContain('Timeout 1 hour (hold Shift)');
    expect(titles).toContain('Kick from server (hold Shift)');
    expect(titles).toContain('Ban from server (hold Shift)');
  });

  it('does not show moderation actions without permission', async () => {
    await mountBar({ showModActions: false, shiftPressed: true });
    expect(
      visibleActionTitles().some((t) => t.includes('Ban from server')),
    ).toBe(false);
  });

  it('keeps own-message delete on Shift, not moderation block', async () => {
    await mountBar({ isOwnMessage: true, shiftPressed: true });
    const titles = visibleActionTitles();
    expect(titles).toContain('Delete (hold Shift)');
    expect(titles).not.toContain('Ban from server (hold Shift)');
  });
});
