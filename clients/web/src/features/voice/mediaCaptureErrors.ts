import { UIErrorBus } from '@/features/layout/failures/uiErrorBus';
import {
  echoCameraPublishPermissionDeniedHint,
  echoScreenCapturePermissionDeniedHint,
} from '@/features/voice/mediaPermissionHints';

const MEDIA_CAPTURE_UI_DEDUPE_MS = 4500;
let lastMediaCaptureUiEmit: {
  context: string;
  userMessage: string;
  atMs: number;
} | null = null;

function domMediaExceptionName(e: unknown): string {
  if (e === null || e === undefined) return '';
  if (typeof e === 'object' && 'name' in e) {
    const n = (e as { name?: unknown }).name;
    if (typeof n === 'string' && n.trim()) return n.trim();
  }
  if (typeof DOMException !== 'undefined' && e instanceof DOMException) {
    return e.name?.trim() ?? '';
  }
  if (e instanceof Error) return e.name?.trim() ?? '';
  return '';
}

function domMediaExceptionMessage(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  return '';
}

/**
 * True when the user aborted the picker / flow without selecting a source.
 * Do **not** treat `NotAllowedError` as cancel: browsers use it for permission denial too.
 */
export function isDisplayMediaFlowAbortedWithoutResult(e: unknown): boolean {
  const name = domMediaExceptionName(e);
  if (name === 'AbortError') return true;
  const msg = domMediaExceptionMessage(e).toLowerCase();
  if (!msg) return false;
  return (
    /the operation was aborted/.test(msg) ||
    /user aborted/.test(msg) ||
    /cancell?ed by user/.test(msg)
  );
}

export function screenShareFailureUserMessage(e: unknown): string {
  const name = domMediaExceptionName(e).toLowerCase();
  const msgLower = domMediaExceptionMessage(e).toLowerCase();

  if (
    name === 'notallowederror' ||
    name === 'permissiondeniederror' ||
    msgLower.includes('permission denied') ||
    msgLower.includes('not allowed')
  ) {
    return echoScreenCapturePermissionDeniedHint();
  }
  if (
    name === 'notfounderror' ||
    name === 'devicesnotfounderror' ||
    msgLower.includes('no display') ||
    msgLower.includes('device not found')
  ) {
    return (
      'No screen or window was available to share. Connect a display, try another source, ' +
      'or tap Share screen again and pick a window or screen.'
    );
  }
  if (
    name === 'notreadableerror' ||
    name === 'trackstarterror' ||
    msgLower.includes('could not start video source') ||
    msgLower.includes('in use')
  ) {
    return (
      'The display could not be captured (it may be in use or protected). Close other capture or recording software, ' +
      'then try Share screen again.'
    );
  }
  if (name === 'securityerror') {
    return 'Screen capture is blocked here (secure context required). Open Echo on HTTPS or http://localhost, then try again.';
  }
  if (name === 'overconstrainederror' || name === 'typeerror') {
    return 'Screen share could not start with the current quality options. Lower the preset in streaming settings or try again.';
  }
  if (name === 'invalidstateerror') {
    return 'Screen share is not ready yet (another capture may still be closing). Wait a moment and try again.';
  }

  const hint =
    domMediaExceptionMessage(e) || domMediaExceptionName(e) || 'Unknown error';
  const short = hint.length > 140 ? `${hint.slice(0, 137)}…` : hint;
  return `Could not start screen share (${short}). Check browser permissions and try again.`;
}

export function cameraPublishFailureUserMessage(e: unknown): string {
  const name = domMediaExceptionName(e).toLowerCase();
  const msgLower = domMediaExceptionMessage(e).toLowerCase();

  if (
    name === 'notallowederror' ||
    name === 'permissiondeniederror' ||
    msgLower.includes('permission denied') ||
    msgLower.includes('not allowed')
  ) {
    return echoCameraPublishPermissionDeniedHint();
  }
  if (
    name === 'notfounderror' ||
    name === 'devicesnotfounderror' ||
    msgLower.includes('device not found')
  ) {
    return 'No camera was found. Connect a webcam or pick another camera in Voice & Video settings, then try again.';
  }
  if (
    name === 'notreadableerror' ||
    name === 'trackstarterror' ||
    msgLower.includes('could not start video source') ||
    msgLower.includes('in use')
  ) {
    return 'The camera could not be opened (it may be in use). Close other apps using the camera, pick another device in Voice settings, then try again.';
  }
  if (name === 'securityerror') {
    return 'Camera access is blocked (secure context required). Use HTTPS or localhost, then try again.';
  }
  if (name === 'overconstrainederror') {
    return 'This camera cannot be used with the current quality settings. Pick another camera or lower video quality, then try again.';
  }
  if (name === 'aborterror') {
    return 'Camera access was interrupted. Try turning video on again.';
  }
  if (name === 'invalidstateerror') {
    return 'Camera is not ready yet. Wait a moment and try turning video on again.';
  }

  const hint =
    domMediaExceptionMessage(e) || domMediaExceptionName(e) || 'Unknown error';
  const short = hint.length > 120 ? `${hint.slice(0, 117)}…` : hint;
  return `Could not start camera (${short}). Check Voice & Video settings and browser permissions, then try again.`;
}

export function shouldStopScreenShareCapturePresetRetries(e: unknown): boolean {
  const name = domMediaExceptionName(e).toLowerCase();
  switch (name) {
    case 'notallowederror':
    case 'permissiondeniederror':
    case 'securityerror':
    case 'notfounderror':
    case 'devicesnotfounderror':
    case 'notreadableerror':
    case 'trackstarterror':
    case 'invalidstateerror':
      return true;
    default:
      return false;
  }
}

export function emitDedupedMediaCaptureUiFailure(opts: {
  context: string;
  userMessage: string;
  retryAction?: () => void;
}): void {
  const now = Date.now();
  const prev = lastMediaCaptureUiEmit;
  if (
    prev &&
    prev.context === opts.context &&
    prev.userMessage === opts.userMessage &&
    now - prev.atMs < MEDIA_CAPTURE_UI_DEDUPE_MS
  ) {
    return;
  }
  lastMediaCaptureUiEmit = {
    context: opts.context,
    userMessage: opts.userMessage,
    atMs: now,
  };
  UIErrorBus.emit({
    context: opts.context,
    severity: 'warning',
    userMessage: opts.userMessage,
    retryAction: opts.retryAction,
  });
}
