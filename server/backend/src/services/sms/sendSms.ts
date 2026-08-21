import type { FastifyBaseLogger } from 'fastify';
import { config } from '../../config';
import { TELNYX_SMS_FETCH_MS } from '../../constants/outboundHttp';

export type OutboundSms = {
  toE164: string;
  body: string;
};

function telnyxConfigured(): boolean {
  return Boolean(
    config.echoTelnyxApiKey?.trim() && config.echoTelnyxFromNumber?.trim(),
  );
}

/**
 * Sends via Telnyx Messages API when key + from number are set; otherwise logs only.
 */
export async function sendTransactionalSms(
  log: FastifyBaseLogger,
  sms: OutboundSms,
): Promise<void> {
  if (!telnyxConfigured()) {
    log.info(
      {
        msg: 'sms_outbound_skipped_no_telnyx',
        to: sms.toE164,
        bodyLength: sms.body.length,
      },
      'SMS skipped (ECHO_TELNYX_API_KEY or ECHO_TELNYX_FROM_NUMBER unset)',
    );
    return;
  }

  const res = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(TELNYX_SMS_FETCH_MS),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.echoTelnyxApiKey}`,
    },
    body: JSON.stringify({
      from: config.echoTelnyxFromNumber,
      to: sms.toE164,
      text: sms.body,
    }),
  });

  if (!res.ok) {
    log.error(
      {
        msg: 'telnyx_sms_failed',
        status: res.status,
      },
      'Telnyx message send failed',
    );
    throw new Error('TELNYX_SMS_FAILED');
  }
}
