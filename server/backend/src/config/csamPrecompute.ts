function parseEchoCsamImageScanMode(): 'off' | 'dry_run' | 'on' {
  const raw = process.env.ECHO_CSAM_IMAGE_SCAN_MODE?.trim().toLowerCase() ?? '';
  if (raw === 'on' || raw === 'dry_run') return raw;
  return 'off';
}

function parseEchoCsamExternalScanCmdArgv(): string[] | null {
  const raw = process.env.ECHO_CSAM_EXTERNAL_SCAN_CMD?.trim();
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return null;
    return v.map((s) => String(s));
  } catch {
    return null;
  }
}

export type CsamScanConfig = {
  echoCsamImageScanMode: 'off' | 'dry_run' | 'on';
  echoCsamImageScanEffective: 'off' | 'dry_run' | 'on';
  echoCsamSha256BlocklistPath: string | null;
  echoCsamExternalScanCmdArgv: string[] | null;
};

/** Pre-resolves CSAM scan mode before the main config object is built. */
export function resolveCsamScanConfig(): CsamScanConfig {
  const echoCsamImageScanMode = parseEchoCsamImageScanMode();
  const echoCsamSha256BlocklistPath =
    process.env.ECHO_CSAM_SHA256_BLOCKLIST_PATH?.trim() || null;
  const echoCsamExternalScanCmdArgv = parseEchoCsamExternalScanCmdArgv();
  const echoCsamHasConfiguredScanners = Boolean(
    (echoCsamSha256BlocklistPath && echoCsamSha256BlocklistPath.length > 0) ||
    (echoCsamExternalScanCmdArgv && echoCsamExternalScanCmdArgv.length > 0),
  );
  let echoCsamImageScanEffective: 'off' | 'dry_run' | 'on' =
    echoCsamImageScanMode;
  if (echoCsamImageScanMode === 'on' && !echoCsamHasConfiguredScanners) {
    echoCsamImageScanEffective = 'dry_run';
    if (process.env.ECHO_CONFIG_TEST_ISOLATION !== '1') {
      console.warn(
        '[echo-config] ECHO_CSAM_IMAGE_SCAN_MODE=on requires ECHO_CSAM_SHA256_BLOCKLIST_PATH and/or ECHO_CSAM_EXTERNAL_SCAN_CMD (JSON argv); falling back to dry_run until scanners are configured.',
      );
    }
  }
  return {
    echoCsamImageScanMode,
    echoCsamImageScanEffective,
    echoCsamSha256BlocklistPath,
    echoCsamExternalScanCmdArgv,
  };
}
