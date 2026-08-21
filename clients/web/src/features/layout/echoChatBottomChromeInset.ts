import { ref } from 'vue';

/** Viewport distance from the top of the active chat bottom stack to the layout bottom. */
export const echoChatBottomChromeInsetPx = ref(0);

const insetByOwner = new Map<symbol, number>();

let ownerSeq = 0;

export function createEchoChatBottomChromeOwner(): symbol {
  ownerSeq += 1;
  return Symbol(`echo-chat-bottom-chrome-${ownerSeq}`);
}

function recomputeEchoChatBottomChromeInset() {
  let max = 0;
  for (const v of insetByOwner.values()) {
    if (v > max) max = v;
  }
  echoChatBottomChromeInsetPx.value = max;
}

export function setEchoChatBottomChromeInset(
  owner: symbol,
  insetPx: number,
): void {
  insetByOwner.set(owner, Math.max(0, Math.round(insetPx)));
  recomputeEchoChatBottomChromeInset();
}

export function clearEchoChatBottomChromeOwner(owner: symbol): void {
  insetByOwner.delete(owner);
  recomputeEchoChatBottomChromeInset();
}
