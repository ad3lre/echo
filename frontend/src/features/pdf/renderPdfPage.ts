import type { PDFPageProxy, PageViewport, RenderTask } from 'pdfjs-dist';

export type PdfRenderOptions = {
  page: PDFPageProxy;
  canvas: HTMLCanvasElement;
  /** CSS pixels width for the rendered viewport (devicePixelRatio applied inside). */
  cssWidth: number;
};

function readDevicePixelRatio(): number {
  if (
    typeof globalThis !== 'undefined' &&
    'devicePixelRatio' in globalThis &&
    typeof globalThis.devicePixelRatio === 'number'
  ) {
    return globalThis.devicePixelRatio;
  }
  return 1;
}

/**
 * Renders a full PDF page into a canvas at the given CSS width (sharp on HiDPI).
 */
export function renderPdfPageToCanvas(opts: PdfRenderOptions): {
  viewport: PageViewport;
  renderTask: RenderTask;
} {
  const { page, canvas, cssWidth } = opts;
  const dpr = readDevicePixelRatio();
  const base = page.getViewport({ scale: 1 });
  const scale = (cssWidth * dpr) / base.width;
  const viewport = page.getViewport({ scale });

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${viewport.height / dpr}px`;

  const renderTask = page.render({
    canvasContext: context,
    viewport,
    canvas,
  });

  return { viewport, renderTask };
}
