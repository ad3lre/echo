import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

/** OTel via OTEL_* env. Under Bun, skip auto-instrumentations (loader gaps). */

const isBun = typeof Bun !== 'undefined';

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: 'echo-backend',
  }),
  traceExporter: new OTLPTraceExporter(),
  instrumentations: isBun ? [] : [getNodeAutoInstrumentations()],
});

export function initOTel() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  try {
    sdk.start();
  } catch {
    /* OTel optional */
  }
}

process.on('SIGTERM', () => {
  void sdk.shutdown().finally(() => process.exit(0));
});
