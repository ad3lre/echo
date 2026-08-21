import { createHash } from 'node:crypto';
import { config } from '../../config';
import { readEchoUploadObjectBytes } from './readUploadObjectBytes';
import { runEchoConfiguredCsamScanners } from './scanner';
import type { CsamImagePipelineResult, CsamScanLog } from './types';

export {
  CSAM_HASH_LIST_UPDATE_GUIDANCE,
  CSAM_OPERATOR_LEGAL_PREREQUISITES,
} from './legalPrerequisites';
export type { CsamImagePipelineResult, CsamScanLog } from './types';
export { purgeEchoUploadObject } from './purgeUploadObject';

/**
 * Server-side upload integrity step for `dedupe/register`: reads stored bytes, verifies SHA-256
 * for images and videos, runs configured hash / external scanners for images only.
 */
export async function runEchoUploadIntegrityRegisterStep(opts: {
  kind: 'image' | 'video';
  storageKey: string;
  byteLength: number;
  sha256HexClient: string;
  log: CsamScanLog;
}): Promise<CsamImagePipelineResult> {
  const verify = config.echoVerifyImageSha256OnRegister;
  const effective = config.echoCsamImageScanEffective;
  const needBytes = verify || (opts.kind === 'image' && effective !== 'off');

  if (!needBytes) {
    return { ok: true };
  }

  let bytes: Buffer;
  try {
    bytes = await readEchoUploadObjectBytes({
      storageKey: opts.storageKey,
      byteLength: opts.byteLength,
    });
  } catch {
    return { ok: false, reason: 'scanner_error' };
  }

  if (verify) {
    const computed = createHash('sha256').update(bytes).digest('hex');
    const client = opts.sha256HexClient.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(client) || computed !== client) {
      return { ok: false, reason: 'integrity_sha256_mismatch' };
    }
  }

  if (opts.kind !== 'image') {
    return { ok: true };
  }

  if (effective === 'off') {
    return { ok: true };
  }

  if (effective === 'dry_run') {
    opts.log.info(
      {
        echo_csam: 'dry_run',
        storage_key_head: opts.storageKey.slice(0, 32),
      },
      'echo.csam.dry_run',
    );
    return { ok: true };
  }

  const r = await runEchoConfiguredCsamScanners(bytes, opts.log);
  if (r === 'match') {
    return { ok: false, reason: 'policy_block' };
  }
  if (r === 'scanner_error') {
    if (config.echoCsamFailClosed) {
      return { ok: false, reason: 'scanner_error' };
    }
    opts.log.warn(
      { echo_csam: 'scanner_error_fail_open' },
      'echo.csam.scanner_error_ignored',
    );
  }
  return { ok: true };
}
