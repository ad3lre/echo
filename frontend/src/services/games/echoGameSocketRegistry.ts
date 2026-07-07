import { ref, type Ref } from 'vue';
import type { Socket } from 'socket.io-client';

let getSocket: (() => Socket | null) | null = null;
const echoSocketConnected = ref(false);

/** Register the main Echo Socket.IO client for tunneled VC games. */
export function registerEchoGameSocketGetter(
  fn: (() => Socket | null) | null,
): void {
  getSocket = fn;
}

export function getEchoGameSocket(): Socket | null {
  return getSocket?.() ?? null;
}

export function setEchoGameSocketConnected(connected: boolean): void {
  echoSocketConnected.value = connected;
}

export function getEchoGameSocketConnectedRef(): Ref<boolean> {
  return echoSocketConnected;
}
