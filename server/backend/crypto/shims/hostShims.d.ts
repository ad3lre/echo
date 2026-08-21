/**
 * Temporary host-adapter shims so `crypto` typechecks without compiling all of web.
 * Replace with a real host adapter; keep shims intentionally loose.
 */

declare module '@/features/layout/ids/randomUuid' {
  export function randomUuidV4(): string;
}

declare module '@/api/echo/transport' {
  export class EchoApiError extends Error {
    status: number;
    body: any;
    constructor(message: string, status?: number, body?: any);
  }
  export function echoFetch<T = any>(
    token: any,
    path: string,
    init?: any,
  ): Promise<T>;
  export function trimEchoPathSegment(raw: string): string;
}

declare module '@/api/echo/e2ee' {
  export type EchoE2eeDeviceListRow = any;
  export function postEchoE2eeDeviceRegister(...args: any[]): Promise<any>;
  export function postEchoE2eePrekeysRefresh(...args: any[]): Promise<any>;
  export function getEchoE2eeDevices(...args: any[]): Promise<any>;
  export function postEchoRevokeE2eeDevice(...args: any[]): Promise<any>;
  export function postEchoE2eePairingStart(...args: any[]): Promise<any>;
  export function getEchoE2eePairingState(...args: any[]): Promise<any>;
  export function postEchoE2eePairingRespond(...args: any[]): Promise<any>;
}

/** Vue ref shim — host owns the real reactive state until the adapter lands. */
declare module '@/features/voice/voiceE2eeActiveState' {
  export const activeVoiceE2eeChannelKey: { value: string | null };
}
