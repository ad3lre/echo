import type { Editor } from '@tiptap/core';

export function downloadPaperJson(
  channelName: string,
  contentJson: Record<string, unknown>,
) {
  const blob = new Blob([JSON.stringify(contentJson, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = channelName.replace(/[^\w\s-]/g, '').trim() || 'paper';
  a.href = url;
  a.download = `${safeName}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function resolvePaperPageElement(
  pageEl: HTMLElement | null | undefined,
): HTMLElement | null {
  if (pageEl) return pageEl;
  return document.querySelector<HTMLElement>('.paper-page');
}

/** Opens the browser print dialog (Save as PDF) for the paper page element. */
export function printPaperPage(
  pageEl: HTMLElement | null,
  channelName?: string,
) {
  const target = resolvePaperPageElement(pageEl);
  if (!target) return false;
  const prevTitle = document.title;
  const safeName = channelName?.trim() || 'Paper';
  document.title = safeName;
  const style = document.createElement('style');
  style.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      .paper-print-root, .paper-print-root * { visibility: visible !important; }
      .paper-print-root {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
      }
    }
  `;
  const cleanup = () => {
    target.classList.remove('paper-print-root');
    style.remove();
    document.title = prevTitle;
    window.removeEventListener('afterprint', cleanup);
  };
  target.classList.add('paper-print-root');
  document.head.appendChild(style);
  window.addEventListener('afterprint', cleanup);
  window.print();
  return true;
}

export function copyPaperPlainText(editor: Editor | null): string {
  if (!editor) return '';
  return editor.getText();
}
