import { invoke, isTauri } from '@tauri-apps/api/core';

export type IosHapticKind =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error';

type IosHapticResult = {
  performed: boolean;
};

const IS_IOS_TAURI_BUILD = import.meta.env.VITE_ECHO_IOS === '1';
let commandUnavailable = false;

export function isIosTauriShell(): boolean {
  return IS_IOS_TAURI_BUILD && isTauri();
}

export function markIosNativeShell(): void {
  if (!IS_IOS_TAURI_BUILD || typeof document === 'undefined') return;
  document.documentElement.classList.add('echo-shell-ios');
  document.documentElement.setAttribute('data-echo-platform', 'ios');
}

export function iosNativeHaptic(kind: IosHapticKind = 'light'): void {
  if (commandUnavailable || !isIosTauriShell()) return;
  void invoke<IosHapticResult>('ios_native_haptic', { kind }).catch(() => {
    commandUnavailable = true;
  });
}
