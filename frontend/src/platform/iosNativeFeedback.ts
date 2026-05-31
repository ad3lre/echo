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

/**
 * Cached "running in the iOS Simulator" flag.
 *
 * The iOS Simulator's CoreAudio HAL frequently times out when WebKit starts an
 * audio output unit (`AudioOutputUnitAdaptor::start()` → `_ReportRPCTimeout`),
 * which aborts WebKit's GPU process the moment a Web Audio `AudioContext` resumes.
 * We skip Echo's audio priming/preload on the Simulator only. Read synchronously
 * via `getIsIosSimulator()`; populated by `detectIosSimulator()` which is fired
 * early in `main.ts`, well before the first user interaction that would prime audio.
 * Always `false` on real devices and non-iOS builds, so device behavior is unchanged.
 */
let iosSimulator = false;
let iosSimulatorDetected = false;

export function getIsIosSimulator(): boolean {
  return iosSimulator;
}

export async function detectIosSimulator(): Promise<boolean> {
  if (iosSimulatorDetected) return iosSimulator;
  if (!isIosTauriShell()) {
    iosSimulatorDetected = true;
    return false;
  }
  try {
    iosSimulator = await invoke<boolean>('ios_is_simulator');
  } catch {
    iosSimulator = false;
  }
  iosSimulatorDetected = true;
  return iosSimulator;
}

export function iosNativeHaptic(kind: IosHapticKind = 'light'): void {
  if (commandUnavailable || !isIosTauriShell()) return;
  void invoke<IosHapticResult>('ios_native_haptic', { kind }).catch(() => {
    commandUnavailable = true;
  });
}
