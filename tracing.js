const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');

// Configure the SDK to export telemetry data to the console
// In production, you would typically export to a proper observability backend
const sdk = new NodeSDK({
  serviceName: 'otel-http-server',
  serviceVersion: '1.0.0',
  traceExporter: new ConsoleSpanExporter(),
  // Uncomment the line below to export to Jaeger (requires Jaeger running locally)
  // traceExporter: new JaegerExporter(),
  instrumentations: [getNodeAutoInstrumentations({
    // Disable fs instrumentation to reduce noise
    '@opentelemetry/instrumentation-fs': {
      enabled: false,
    },
  })],
});

// Initialize the SDK and register with the OpenTelemetry API
sdk.start();

console.log('Tracing initialized');

// Gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});
