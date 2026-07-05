import { isWebKitDesktop } from '@/platform/browserCompatibility';

type MacPrivacyPane = 'Microphone' | 'Camera' | 'Screen Recording';

function macEchoPrivacyHint(pane: MacPrivacyPane): string {
  return `Open System Settings → Privacy & Security → ${pane} and enable Echo, then try again.`;
}

export function echoMicPermissionDeniedHint(): string {
  if (isWebKitDesktop()) {
    return `Microphone access was blocked. ${macEchoPrivacyHint('Microphone')}`;
  }
  return 'Microphone access was blocked. Allow the mic for this site in your browser bar, then tap Retry.';
}

export function echoCameraPermissionDeniedHint(): string {
  if (isWebKitDesktop()) {
    return `Camera access was blocked. ${macEchoPrivacyHint('Camera')}`;
  }
  return 'Camera access was blocked. Allow the camera for this site in your browser bar, then turn video on again.';
}

export function echoScreenCapturePermissionDeniedHint(): string {
  if (isWebKitDesktop()) {
    return (
      'Screen capture was blocked or the picker was closed without a selection. ' +
      `${macEchoPrivacyHint('Screen Recording')} ` +
      'Then tap Share screen again.'
    );
  }
  return (
    'Screen capture was blocked or the picker was closed without a selection. ' +
    'Allow screen capture for this site from the address bar (lock or site icon → permissions). ' +
    'On macOS, open System Settings → Privacy & Security → Screen Recording and enable your browser; restart the browser if macOS asks. ' +
    'Then tap Share screen again.'
  );
}

export function echoCameraPublishPermissionDeniedHint(): string {
  if (isWebKitDesktop()) {
    return `Camera access was blocked. ${macEchoPrivacyHint('Camera')} Then turn video on again.`;
  }
  return (
    'Camera access was blocked. Allow the camera for this site from the address bar (lock or site icon → permissions). ' +
    'On macOS, check System Settings → Privacy & Security → Camera for your browser. Then turn video on again.'
  );
}

export function echoVoiceJoinPreflightRetrySuffix(): string {
  if (isWebKitDesktop()) {
    return 'Check System Settings → Privacy & Security → Microphone for Echo, review Voice & Video settings, or plug in a headset, then try again.';
  }
  return 'Allow the mic in your browser bar, check Voice & Video settings, or plug in a headset, then try again.';
}
