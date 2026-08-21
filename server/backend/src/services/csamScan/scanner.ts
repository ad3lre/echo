import { createHash } from 'node:crypto';
import { config } from '../../config';
import { runExternalCsamScanCmd } from './externalScanCmd';
import { Sha256BlocklistStore } from './sha256Blocklist';
import type { CsamScanLog } from './types';

const blocklistStore = new Sha256BlocklistStore(
  config.echoCsamSha256BlocklistPath,
  config.echoCsamBlocklistReloadMinutes * 60_000,
);

export async function runEchoConfiguredCsamScanners(
  bytes: Buffer,
  log: CsamScanLog,
): Promise<'pass' | 'match' | 'scanner_error'> {
  await blocklistStore.refreshIfNeeded();
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (blocklistStore.has(sha)) {
    log.warn({ echo_csam: 'sha256_list' }, 'echo.csam.blocklist_hit');
    return 'match';
  }

  const argv = config.echoCsamExternalScanCmdArgv;
  if (argv && argv.length > 0) {
    const r = await runExternalCsamScanCmd({
      argvTemplate: argv,
      inputBytes: bytes,
      timeoutMs: config.echoCsamExternalScanTimeoutMs,
    });
    if (r === 'match') {
      log.warn({ echo_csam: 'external' }, 'echo.csam.external_hit');
      return 'match';
    }
    if (r === 'error') {
      log.warn(
        { echo_csam: 'external_error' },
        'echo.csam.external_scan_error',
      );
      return 'scanner_error';
    }
  }

  return 'pass';
}
