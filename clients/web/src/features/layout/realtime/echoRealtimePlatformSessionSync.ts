export type EchoRealtimePlatformSession = {
  setLiveSyncConnected: (connected: boolean) => void;
};

export type EchoRealtimePlatformSessionSync = {
  setConnected: (connected: boolean) => void;
};

/**
 * Isolates platform integration side effects from socket wiring.
 * The socket layer should not care what "platform session" means.
 */
export function createEchoRealtimePlatformSessionSync(
  platformSession: EchoRealtimePlatformSession | null,
): EchoRealtimePlatformSessionSync {
  if (!platformSession) {
    return { setConnected: () => {} };
  }
  return {
    setConnected: (connected) =>
      platformSession.setLiveSyncConnected(connected),
  };
}
