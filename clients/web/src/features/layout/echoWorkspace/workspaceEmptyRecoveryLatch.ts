const MAX_SUSPICIOUS_EMPTY_RECOVERY_ATTEMPTS = 3;

let recoveryAttempts = 0;
let recoveryExhausted = false;

export function resetSuspiciousEmptyRecoveryLatchForTests(): void {
  recoveryAttempts = 0;
  recoveryExhausted = false;
}

export function isSuspiciousEmptyRecoveryExhausted(): boolean {
  return recoveryExhausted;
}

export function noteSuspiciousEmptyRecoveryAttempt(): void {
  recoveryAttempts += 1;
  if (recoveryAttempts >= MAX_SUSPICIOUS_EMPTY_RECOVERY_ATTEMPTS) {
    recoveryExhausted = true;
  }
}

/** Clears the latch after a non-empty workspace snapshot lands. */
export function clearSuspiciousEmptyRecoveryLatch(): void {
  recoveryAttempts = 0;
  recoveryExhausted = false;
}
