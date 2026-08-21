export type GpuTier = 'full' | 'reduced';

/**
 * `navigator.deviceMemory` is often undefined on desktop Chrome / Firefox.
 * Do not treat "unknown" as low RAM — that incorrectly forced `reduced` tier
 * for capable devices.
 *
 * Do **not** use `navigator.hardwareConcurrency` for this decision: Brave Shields
 * (and similar fingerprinting mitigations) commonly report a spoofed core count
 * (often 2–4). That is not a reliable GPU/CPU capability signal and caused
 * low-tier detection to misclassify desktops.
 */
function readDeviceMemoryGb(): number | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
}

export function detectGpuTier(): GpuTier {
  if (typeof navigator === 'undefined') return 'full';
  const memGb = readDeviceMemoryGb();
  if (memGb !== null && memGb <= 4) return 'reduced';
  return 'full';
}

export function applyGpuTierToDocument(tier: GpuTier): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.gpuTier = tier;
}
