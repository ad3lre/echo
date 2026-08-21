// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { MessageAttachmentPayload } from '@shared/types';

vi.mock('@/features/pdf/loadPdfFromUrl', () => ({
  startPdfUrlLoad: vi.fn(() => ({
    task: null,
    promise: Promise.reject(new Error('mock load fail')),
  })),
  destroyPdfLoad: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/platform/desktopBridge', () => ({
  openExternal: vi.fn(),
}));

import DocumentViewerModal from './DocumentViewerModal.vue';

const pdfAtt: MessageAttachmentPayload = {
  kind: 'document',
  url: 'https://example.com/report.pdf',
  filename: 'report.pdf',
  mimeType: 'application/pdf',
};

describe('DocumentViewerModal', () => {
  let app: App | undefined;
  let container: HTMLDivElement | undefined;
  const errors: unknown[] = [];

  afterEach(() => {
    app?.unmount();
    app = undefined;
    container?.remove();
    container = undefined;
    errors.length = 0;
  });

  it('opens PDF viewer shell without bubbling errors to the host', async () => {
    const open = ref(true);
    const doc = ref<MessageAttachmentPayload | null>(pdfAtt);

    const Host = defineComponent({
      setup() {
        return () =>
          h(DocumentViewerModal, {
            modelValue: open.value,
            'onUpdate:modelValue': (v: boolean) => {
              open.value = v;
            },
            attachment: doc.value,
          });
      },
    });

    app = createApp(Host);
    app.config.errorHandler = (err) => {
      errors.push(err);
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    app.mount(container);

    await vi.waitFor(() => {
      expect(document.body.textContent).toMatch(
        /Loading PDF|Could not load|mock load fail/i,
      );
    });

    expect(errors).toEqual([]);
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
  });
});
