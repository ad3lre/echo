import { computed, type Ref } from 'vue';

export function generateBase32Secret(length = 16) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let out = '';
  for (let i = 0; i < length; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  return out.replace(/(.{4})/g, '$1 ').trim();
}

export function useTwoFactorQr(twoFactorSecret: Ref<string>) {
  const twoFactorQrSize = 21;

  const twoFactorQrRects = computed(() => {
    const size = twoFactorQrSize;
    const seedSource = twoFactorSecret.value.replace(/\s+/g, '');
    let seed = 0;
    for (let i = 0; i < seedSource.length; i++)
      seed = (seed * 31 + seedSource.charCodeAt(i)) >>> 0;

    const hashAt = (r: number, c: number) => {
      const x = (seed + r * 131 + c * 313) >>> 0;
      const y = (x * 1103515245 + 12345) >>> 0;
      return y / 0xffffffff;
    };

    const isFinder = (r: number, c: number) => {
      const inTL = r < 7 && c < 7;
      const inTR = r < 7 && c >= size - 7;
      const inBL = r >= size - 7 && c < 7;
      return inTL || inTR || inBL;
    };

    const isFinderOn = (r: number, c: number) => {
      const inTR = r < 7 && c >= size - 7;
      const inBL = r >= size - 7 && c < 7;

      let rr = r;
      let cc = c;
      if (inTR) cc = c - (size - 7);
      if (inBL) rr = r - (size - 7);

      const outer = rr === 0 || rr === 6 || cc === 0 || cc === 6;
      const inner = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
      return outer || inner;
    };

    const rects: Array<{ x: number; y: number }> = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const on = isFinder(r, c)
          ? isFinderOn(r, c)
          : hashAt(r, c) > 0.55 &&
            !(r <= 8 && c <= 8) &&
            !(r <= 8 && c >= size - 9) &&
            !(r >= size - 9 && c <= 8);
        if (on) rects.push({ x: c, y: r });
      }
    }
    return rects;
  });

  return { twoFactorQrRects };
}
