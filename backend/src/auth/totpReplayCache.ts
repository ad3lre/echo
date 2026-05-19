/**
 * Simple in-memory cache to mitigate TOTP replay attacks.
 * In a multi-node production environment, this should be backed by Redis.
 */

const usedCodes = new Map<string, number>();

// Clean up expired codes every 1 minute
setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of usedCodes.entries()) {
    if (now > expiresAt) {
      usedCodes.delete(key);
    }
  }
}, 60000).unref();

/**
 * Returns true if the code was already used.
 * Otherwise, marks it as used and returns false.
 */
export function checkAndMarkTotpUsed(userId: string, code: string): boolean {
  const key = `${userId}:${code}`;
  if (usedCodes.has(key)) {
    return true; // Replay detected
  }
  // Store with a TTL of 90 seconds (covers the 30s epoch tolerance + clock drift)
  usedCodes.set(key, Date.now() + 90000);
  return false;
}
