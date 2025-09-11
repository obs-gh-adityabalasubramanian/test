const { logs, SeverityNumber } = require('@opentelemetry/api-logs');
const { trace, metrics } = require('@opentelemetry/api');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { BatchLogRecordProcessor, LoggerProvider } = require('@opentelemetry/sdk-logs');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');

// Configuration
const serviceName = 'otel-http-server';

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
const otlpEndpointBearerToken = process.env.OTEL_EXPORTER_OTLP_BEARER_TOKEN;

const authHeader = otlpEndpointBearerToken
  ? { Authorization: `Bearer ${otlpEndpointBearerToken}` }
  : {};

// Create resource
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
});

// Initialize Logger Provider
const loggerProvider = new LoggerProvider({
  resource: resource,
  processors: [
    new BatchLogRecordProcessor(
      new OTLPLogExporter({
        url: `${otlpEndpoint}/v1/logs`,
        headers: {
          ...authHeader,
          'x-observe-target-package': 'Logs',
        },
      })
    ),
  ],
});

// Initialize OpenTelemetry SDK
const sdk = new NodeSDK({
  resource: resource,
  traceExporter: new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
    headers: {
      ...authHeader,
      'x-observe-target-package': 'Tracing',
    },
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${otlpEndpoint}/v1/metrics`,
      headers: {
        ...authHeader,
        'x-observe-target-package': 'Metrics',
      },
    }),
  }),
  instrumentations: [getNodeAutoInstrumentations({
    // Disable fs instrumentation to reduce noise
    '@opentelemetry/instrumentation-fs': {
      enabled: false,
    },
  })],
});

// Initialize OpenTelemetry
function initOtel() {
  try {
    logs.setGlobalLoggerProvider(loggerProvider);
    sdk.start();

    const logger = logs.getLogger(serviceName);
    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
      body: 'OpenTelemetry SDK started',
    });

    console.log('🔧 OpenTelemetry initialized with OTLP exporters');
    console.log(`📡 Exporting to: ${otlpEndpoint}`);
  } catch (error) {
    const logger = logs.getLogger(serviceName);
    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: 'Error starting OpenTelemetry SDK',
      attributes: { error: error.message },
    });
    throw error;
  }
}

// Graceful shutdown
function shutdownOtel() {
  try {
    sdk.shutdown();
    console.log('🔧 OpenTelemetry terminated');
  } catch (error) {
    const logger = logs.getLogger(serviceName);
    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: 'Error shutting down OpenTelemetry SDK',
      attributes: { error: error.message },
    });
    throw error;
  }
}

// Initialize immediately
initOtel();

// Gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  shutdownOtel();
  process.exit(0);
});

process.on('SIGINT', () => {
  shutdownOtel();
  process.exit(0);
});

// Get instances for export
const logger = logs.getLogger(serviceName);
const tracer = trace.getTracer(serviceName, '1.0.0');
const meter = metrics.getMeter(serviceName, '1.0.0');

// Export for use in other modules
module.exports = {
  sdk,
  loggerProvider,
  logger,
  tracer,
  meter,
  initOtel,
  shutdownOtel,
};
