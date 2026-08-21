// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, ref, type App } from 'vue';
import ChatMediaUploadOverlay from './ChatMediaUploadOverlay.vue';
import type { ChatMediaUploadProgressEvent } from '@/api/echoClient';

function buildState(
  overrides: Partial<ChatMediaUploadProgressEvent> = {},
): ChatMediaUploadProgressEvent {
  return {
    phase: 'uploading',
    uploadPercent: 42,
    fileIndex: 0,
    fileTotal: 2,
    fileName: 'long-file-name.png',
    kind: 'image',
    ...overrides,
  };
}

describe('ChatMediaUploadOverlay', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = null;
    container = null;
    document.body.innerHTML = '';
  });

  function mountWithState(state: ChatMediaUploadProgressEvent) {
    const overlayState = ref(state);
    const Harness = defineComponent({
      name: 'ChatMediaUploadOverlayHarness',
      setup() {
        return () => h(ChatMediaUploadOverlay, { state: overlayState.value });
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Harness);
    app.mount(container);
    return { overlayState };
  }

  it('renders compact determinate progress semantics', () => {
    mountWithState(buildState());
    const status = container?.querySelector('[role="status"]');
    const progress = container?.querySelector('[role="progressbar"]');
    expect(status?.textContent).toContain('Uploading');
    expect(status?.textContent).toContain('42%');
    expect(status?.textContent).not.toContain('Sending attachments');
    expect(status?.textContent).not.toContain('Optimize');
    expect(progress?.getAttribute('aria-valuenow')).toBe('42');
  });

  it('renders indeterminate bar without numeric progress value', () => {
    mountWithState(buildState({ phase: 'preparing', uploadPercent: null }));
    const status = container?.querySelector('[role="status"]');
    const progress = container?.querySelector('[role="progressbar"]');
    expect(status?.textContent).toContain('Preparing image');
    expect(status?.textContent).not.toContain('%');
    expect(progress?.getAttribute('aria-valuenow')).toBeNull();
    expect(progress?.getAttribute('aria-valuemin')).toBeNull();
    expect(progress?.getAttribute('aria-valuemax')).toBeNull();
  });
});
