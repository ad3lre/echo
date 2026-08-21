import { timingSafeEqual } from 'node:crypto';

export function safeCompare(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}
