const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { PeriodicExportingMetricReader, ConsoleMetricExporter } = require('@opentelemetry/sdk-metrics');

// Get configuration from environment variables
const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const OTLP_TOKEN = process.env.OTEL_EXPORTER_OTLP_BEARER_TOKEN;

// Configure resource attributes
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'otel-http-server',
  [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME || 'localhost',
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
});

// Configure exporters
const traceExporter = OTLP_ENDPOINT && OTLP_TOKEN
  ? new OTLPTraceExporter({
      url: `${OTLP_ENDPOINT}/v1/traces`,
      headers: {
        'Authorization': `Bearer ${OTLP_TOKEN}`,
      },
    })
  : undefined; // Will use console exporter as fallback

const metricExporter = OTLP_ENDPOINT && OTLP_TOKEN
  ? new OTLPMetricExporter({
      url: `${OTLP_ENDPOINT}/v1/metrics`,
      headers: {
        'Authorization': `Bearer ${OTLP_TOKEN}`,
      },
    })
  : new ConsoleMetricExporter();

// Configure Prometheus exporter for metrics
const prometheusExporter = new PrometheusExporter({
  port: 9090,
  endpoint: '/metrics',
}, () => {
  console.log('📊 Prometheus metrics available at http://localhost:9090/metrics');
});

// Configure metric readers
const metricReaders = [
  new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10000, // Export every 10 seconds
  }),
  prometheusExporter,
];

// Configure the SDK
const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader: metricReaders[0], // Primary metric reader
  instrumentations: [getNodeAutoInstrumentations({
    // Disable fs instrumentation to reduce noise
    '@opentelemetry/instrumentation-fs': {
      enabled: false,
    },
    // Enable HTTP instrumentation with detailed attributes
    '@opentelemetry/instrumentation-http': {
      enabled: true,
      requestHook: (span, request) => {
        span.setAttributes({
          'http.request.header.user-agent': request.getHeader('user-agent'),
          'http.request.header.x-request-id': request.getHeader('x-request-id'),
        });
      },
    },
    // Enable Express instrumentation
    '@opentelemetry/instrumentation-express': {
      enabled: true,
    },
  })],
});

// Initialize the SDK and register with the OpenTelemetry API
sdk.start();

console.log('🚀 OpenTelemetry initialized');
console.log(`📡 Trace exporter: ${OTLP_ENDPOINT ? 'OTLP' : 'Console'}`);
console.log(`📊 Metrics exporter: ${OTLP_ENDPOINT ? 'OTLP + Prometheus' : 'Console + Prometheus'}`);

// Gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('🔌 OpenTelemetry terminated'))
    .catch((error) => console.log('❌ Error terminating OpenTelemetry', error))
    .finally(() => process.exit(0));
});
