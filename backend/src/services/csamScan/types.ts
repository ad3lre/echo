export type CsamImagePipelineResult =
  | { ok: true }
  | { ok: false; reason: 'integrity_sha256_mismatch' }
  | { ok: false; reason: 'policy_block' }
  | { ok: false; reason: 'scanner_error' };

export type CsamScanLog = {
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  info: (obj: Record<string, unknown>, msg?: string) => void;
};
