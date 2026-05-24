import type {
  PaperCommentPayload,
  PaperDocumentPayload,
} from '@shared/types/paper';

const target = new EventTarget();

export function onPaperDocumentUpdated(
  handler: (doc: PaperDocumentPayload) => void,
): () => void {
  const fn = (e: Event) => {
    handler((e as CustomEvent<PaperDocumentPayload>).detail);
  };
  target.addEventListener('echo-paper-document', fn);
  return () => target.removeEventListener('echo-paper-document', fn);
}

export function emitPaperDocumentUpdated(doc: PaperDocumentPayload): void {
  target.dispatchEvent(new CustomEvent('echo-paper-document', { detail: doc }));
}

export function onPaperCommentUpdated(
  handler: (detail: {
    action: string;
    channelId: string;
    comment: PaperCommentPayload | { id: string; channelId: string };
  }) => void,
): () => void {
  const fn = (e: Event) => {
    handler((e as CustomEvent).detail);
  };
  target.addEventListener('echo-paper-comment', fn);
  return () => target.removeEventListener('echo-paper-comment', fn);
}

export function emitPaperCommentUpdated(detail: {
  action: string;
  channelId: string;
  comment: PaperCommentPayload | { id: string; channelId: string };
}): void {
  target.dispatchEvent(new CustomEvent('echo-paper-comment', { detail }));
}
