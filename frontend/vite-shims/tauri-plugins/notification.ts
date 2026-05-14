/** Web bundle only; desktop builds resolve the real `@tauri-apps/plugin-notification`. */

export async function isPermissionGranted(): Promise<boolean> {
  return false;
}

export async function requestPermission(): Promise<'denied'> {
  return 'denied';
}

export async function sendNotification(): Promise<void> {}
