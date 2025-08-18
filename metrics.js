const { metrics } = require('@opentelemetry/api');

// Get a meter instance
const meter = metrics.getMeter('http-server-metrics', '1.0.0');

// Create metrics instruments
const httpRequestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'Duration of HTTP requests in milliseconds',
  unit: 'ms',
});

const httpRequestsTotal = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
});

const httpRequestsActive = meter.createUpDownCounter('http_requests_active', {
  description: 'Number of active HTTP requests',
});

const httpRequestSize = meter.createHistogram('http_request_size_bytes', {
  description: 'Size of HTTP requests in bytes',
  unit: 'bytes',
});

const httpResponseSize = meter.createHistogram('http_response_size_bytes', {
  description: 'Size of HTTP responses in bytes',
  unit: 'bytes',
});

const databaseOperationDuration = meter.createHistogram('database_operation_duration_ms', {
  description: 'Duration of database operations in milliseconds',
  unit: 'ms',
});

const databaseOperationsTotal = meter.createCounter('database_operations_total', {
  description: 'Total number of database operations',
});

const userOperationsTotal = meter.createCounter('user_operations_total', {
  description: 'Total number of user operations',
});

const validationErrorsTotal = meter.createCounter('validation_errors_total', {
  description: 'Total number of validation errors',
});

// System metrics
const processMemoryUsage = meter.createObservableGauge('process_memory_usage_bytes', {
  description: 'Process memory usage in bytes',
  unit: 'bytes',
});

const processCpuUsage = meter.createObservableGauge('process_cpu_usage_percent', {
  description: 'Process CPU usage percentage',
  unit: 'percent',
});

const processUptime = meter.createObservableGauge('process_uptime_seconds', {
  description: 'Process uptime in seconds',
  unit: 's',
});

// Register observable callbacks for system metrics
processMemoryUsage.addCallback((result) => {
  const memUsage = process.memoryUsage();
  result.observe(memUsage.heapUsed, { type: 'heap_used' });
  result.observe(memUsage.heapTotal, { type: 'heap_total' });
  result.observe(memUsage.rss, { type: 'rss' });
  result.observe(memUsage.external, { type: 'external' });
});

processCpuUsage.addCallback((result) => {
  const cpuUsage = process.cpuUsage();
  result.observe(cpuUsage.user / 1000, { type: 'user' }); // Convert microseconds to milliseconds
  result.observe(cpuUsage.system / 1000, { type: 'system' });
});

processUptime.addCallback((result) => {
  result.observe(process.uptime());
});

// Metrics helper functions
const metricsHelper = {
  // Record HTTP request metrics
  recordHttpRequest: (method, route, statusCode, duration, requestSize = 0, responseSize = 0) => {
    const labels = {
      method: method.toUpperCase(),
      route: route || 'unknown',
      status_code: statusCode.toString(),
      status_class: `${Math.floor(statusCode / 100)}xx`,
    };

    httpRequestsTotal.add(1, labels);
    httpRequestDuration.record(duration, labels);
    
    if (requestSize > 0) {
      httpRequestSize.record(requestSize, labels);
    }
    
    if (responseSize > 0) {
      httpResponseSize.record(responseSize, labels);
    }
  },

  // Record active request changes
  recordActiveRequest: (increment = true) => {
    httpRequestsActive.add(increment ? 1 : -1);
  },

  // Record database operation metrics
  recordDatabaseOperation: (operation, table, duration, success = true) => {
    const labels = {
      operation: operation.toUpperCase(),
      table: table || 'unknown',
      success: success.toString(),
    };

    databaseOperationsTotal.add(1, labels);
    databaseOperationDuration.record(duration, labels);
  },

  // Record user operation metrics
  recordUserOperation: (operation, success = true, userId = null) => {
    const labels = {
      operation,
      success: success.toString(),
    };

    if (userId) {
      labels.user_id = userId.toString();
    }

    userOperationsTotal.add(1, labels);
  },

  // Record validation errors
  recordValidationError: (field, endpoint) => {
    const labels = {
      field: field || 'unknown',
      endpoint: endpoint || 'unknown',
    };

    validationErrorsTotal.add(1, labels);
  },

  // Create a middleware for automatic HTTP metrics collection
  createMetricsMiddleware: () => {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Increment active requests
      metricsHelper.recordActiveRequest(true);

      // Get request size
      const requestSize = parseInt(req.get('content-length') || '0', 10);

      // Override res.end to capture response metrics
      const originalEnd = res.end;
      res.end = function(chunk, encoding) {
        const duration = Date.now() - startTime;
        const responseSize = res.get('content-length') || 
          (chunk ? Buffer.byteLength(chunk, encoding) : 0);

        // Record metrics
        metricsHelper.recordHttpRequest(
          req.method,
          req.route?.path || req.path,
          res.statusCode,
          duration,
          requestSize,
          responseSize
        );

        // Decrement active requests
        metricsHelper.recordActiveRequest(false);

        // Call original end
        originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  },
};

module.exports = {
  metricsHelper,
  // Export individual metrics for direct use if needed
  httpRequestDuration,
  httpRequestsTotal,
  httpRequestsActive,
  httpRequestSize,
  httpResponseSize,
  databaseOperationDuration,
  databaseOperationsTotal,
  userOperationsTotal,
  validationErrorsTotal,
};
