// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';

vi.mock('@/features/pdf/loadPdfFromUrl', () => ({
  startPdfUrlLoad: vi.fn(() => ({
    task: { destroy: vi.fn() },
    promise: Promise.reject(new Error('mock load fail')),
  })),
  destroyPdfLoad: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/platform/desktopBridge', () => ({
  openExternal: vi.fn(),
}));

import PdfDocumentViewer from './PdfDocumentViewer.vue';

describe('PdfDocumentViewer', () => {
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

  it('mounts and surfaces load errors without throwing', async () => {
    app = createApp(PdfDocumentViewer, {
      url: 'https://example.com/report.pdf',
      documentLabel: 'report.pdf',
    });
    app.config.errorHandler = (err) => {
      errors.push(err);
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    app.mount(container);

    await vi.waitFor(() => {
      expect(container?.textContent).toMatch(/Could not load|mock load fail/i);
    });

    expect(errors).toEqual([]);
  });
});
