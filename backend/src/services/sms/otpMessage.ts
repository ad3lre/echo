export function buildSmsOtpBody(
  appName: string,
  code: string,
  ttlMinutes: number,
): string {
  return `${appName}: Your verification code is ${code}. It expires in ${ttlMinutes} minutes.`;
}
