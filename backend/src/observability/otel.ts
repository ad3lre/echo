import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

/**
 * OpenTelemetry initialization for Echo backend.
 * Configured via standard OTEL_* environment variables.
 * Primary endpoint: OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://localhost:4318/v1/traces)
 */

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: 'echo-backend',
  }),
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

export function initOTel() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    // If no endpoint is provided, we don't start the SDK to avoid overhead/errors
    return;
  }

  try {
    sdk.start();
  } catch {
    /* OTel optional; ignore startup failure */
  }
}

process.on('SIGTERM', () => {
  void sdk.shutdown().finally(() => process.exit(0));
});
