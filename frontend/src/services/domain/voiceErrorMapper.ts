export function normalizeVoiceUserMessage(raw: string): string {
  const msg = raw.trim();
  if (!msg) {
    return 'Could not connect to voice. Check the network and try again.';
  }
  const lower = msg.toLowerCase();
  if (lower.includes('communication timeout') || lower.includes('timed out')) {
    return 'You are in a communication timeout in this server and cannot join voice until it ends.';
  }
  return msg;
}
