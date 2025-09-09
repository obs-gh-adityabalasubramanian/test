// Import tracing first to ensure instrumentation is set up before other imports
require('./tracing');

const express = require('express');
const { trace, context, SpanStatusCode, metrics } = require('@opentelemetry/api');
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');

const app = express();
const port = process.env.PORT || 3000;

// Get a tracer instance, logger, and meter
const tracer = trace.getTracer('http-server', '1.0.0');
const logger = logs.getLogger('http-server');
const meter = metrics.getMeter('http-server', '1.0.0');

// Initialize metrics
const httpRequestsTotal = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
});

const httpRequestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'Duration of HTTP requests in milliseconds',
});

const httpRequestsInFlight = meter.createUpDownCounter('http_requests_in_flight', {
  description: 'Number of HTTP requests currently being processed',
});

const userOperationsTotal = meter.createCounter('user_operations_total', {
  description: 'Total number of user operations',
});

const healthCheckDuration = meter.createHistogram('health_check_duration_ms', {
  description: 'Duration of health checks in milliseconds',
});

// Helper function to get trace context for logging
function getTraceContext() {
  const span = trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }
  return {};
}

// Helper function for structured logging
function logWithTrace(level, message, attributes = {}) {
  const traceContext = getTraceContext();
  logger.emit({
    severityNumber: level,
    severityText: level === SeverityNumber.INFO ? 'INFO' :
                  level === SeverityNumber.WARN ? 'WARN' :
                  level === SeverityNumber.ERROR ? 'ERROR' : 'DEBUG',
    body: message,
    attributes: {
      ...attributes,
      ...traceContext,
    },
  });
}

// Middleware to parse JSON bodies
app.use(express.json());

// Custom middleware to add additional span attributes, request logging, and metrics
app.use((req, res, next) => {
  const span = trace.getActiveSpan();
  const requestId = req.get('X-Request-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  if (span) {
    span.setAttributes({
      'http.user_agent': req.get('User-Agent') || 'unknown',
      'http.request_id': requestId,
    });
  }

  // Increment in-flight requests
  httpRequestsInFlight.add(1, {
    method: req.method,
    route: req.route?.path || req.url,
  });

  // Log incoming request
  logWithTrace(SeverityNumber.INFO, 'Incoming HTTP request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent') || 'unknown',
    requestId: requestId,
  });

  // Override res.end to capture metrics when response is sent
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Record metrics
    httpRequestsTotal.add(1, {
      method: req.method,
      status_code: statusCode.toString(),
      route: req.route?.path || req.url,
    });

    httpRequestDuration.record(duration, {
      method: req.method,
      status_code: statusCode.toString(),
      route: req.route?.path || req.url,
    });

    // Decrement in-flight requests
    httpRequestsInFlight.add(-1, {
      method: req.method,
      route: req.route?.path || req.url,
    });

    originalEnd.apply(this, args);
  };

  next();
});

// Root endpoint
app.get('/', (req, res) => {
  const span = tracer.startSpan('handle_root_request');

  try {
    span.setAttributes({
      'custom.endpoint': 'root',
      'custom.method': 'GET',
    });

    logWithTrace(SeverityNumber.INFO, 'Processing root request', {
      endpoint: 'root',
      method: 'GET',
    });

    const response = {
      message: 'Hello from OpenTelemetry instrumented server!',
      timestamp: new Date().toISOString(),
      traceId: span.spanContext().traceId,
    };

    res.json(response);

    logWithTrace(SeverityNumber.INFO, 'Root request completed successfully', {
      endpoint: 'root',
      statusCode: 200,
    });

    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    logWithTrace(SeverityNumber.ERROR, 'Error processing root request', {
      endpoint: 'root',
      error: error.message,
    });

    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    span.end();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const span = tracer.startSpan('health_check');

  try {
    span.setAttributes({
      'custom.endpoint': 'health',
      'custom.check_type': 'basic',
    });

    logWithTrace(SeverityNumber.INFO, 'Starting health check', {
      endpoint: 'health',
      checkType: 'basic',
    });

    // Simulate some work
    const startTime = Date.now();

    // Add a child span for the health check logic
    const childSpan = tracer.startSpan('perform_health_checks', { parent: span });

    // Simulate checking database, external services, etc.
    setTimeout(() => {
      childSpan.setAttributes({
        'health.database': 'ok',
        'health.external_service': 'ok',
      });
      childSpan.end();

      const duration = Date.now() - startTime;
      span.setAttributes({
        'health.check_duration_ms': duration,
      });

      // Record health check metrics
      healthCheckDuration.record(duration, {
        status: 'healthy',
      });

      logWithTrace(SeverityNumber.INFO, 'Health checks completed', {
        endpoint: 'health',
        database: 'ok',
        externalService: 'ok',
        duration: duration,
      });

      const response = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'ok',
          external_service: 'ok',
        },
        duration_ms: duration,
      };

      res.json(response);

      logWithTrace(SeverityNumber.INFO, 'Health check completed successfully', {
        endpoint: 'health',
        statusCode: 200,
        duration: duration,
      });

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }, 50); // Simulate 50ms of work

  } catch (error) {
    logWithTrace(SeverityNumber.ERROR, 'Health check failed', {
      endpoint: 'health',
      error: error.message,
    });

    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    res.status(500).json({ error: 'Health check failed' });
    span.end();
  }
});

// API endpoint with parameters
app.get('/api/users/:id', (req, res) => {
  const span = tracer.startSpan('get_user_by_id');

  try {
    const userId = req.params.id;

    span.setAttributes({
      'custom.endpoint': 'get_user',
      'user.id': userId,
    });

    logWithTrace(SeverityNumber.INFO, 'Looking up user by ID', {
      endpoint: 'get_user',
      userId: userId,
    });

    // Simulate user lookup
    const userSpan = tracer.startSpan('database_lookup', { parent: span });
    userSpan.setAttributes({
      'db.operation': 'SELECT',
      'db.table': 'users',
      'db.query_id': userId,
    });

    // Simulate database delay
    setTimeout(() => {
      userSpan.end();

      if (userId === '404') {
        span.setAttributes({
          'user.found': false,
        });

        // Record user operation metric
        userOperationsTotal.add(1, {
          operation: 'get_user',
          status: 'not_found',
        });

        logWithTrace(SeverityNumber.WARN, 'User not found', {
          endpoint: 'get_user',
          userId: userId,
          statusCode: 404,
        });

        res.status(404).json({ error: 'User not found' });
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'User not found' });
      } else {
        span.setAttributes({
          'user.found': true,
          'user.name': `User ${userId}`,
        });

        // Record user operation metric
        userOperationsTotal.add(1, {
          operation: 'get_user',
          status: 'success',
        });

        const response = {
          id: userId,
          name: `User ${userId}`,
          email: `user${userId}@example.com`,
          timestamp: new Date().toISOString(),
        };

        logWithTrace(SeverityNumber.INFO, 'User found successfully', {
          endpoint: 'get_user',
          userId: userId,
          userName: response.name,
          statusCode: 200,
        });

        res.json(response);
        span.setStatus({ code: SpanStatusCode.OK });
      }

      span.end();
    }, 100); // Simulate 100ms database lookup

  } catch (error) {
    logWithTrace(SeverityNumber.ERROR, 'Error looking up user', {
      endpoint: 'get_user',
      userId: req.params.id,
      error: error.message,
    });

    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    res.status(500).json({ error: 'Internal server error' });
    span.end();
  }
});

// POST endpoint to create a user
app.post('/api/users', (req, res) => {
  const span = tracer.startSpan('create_user');

  try {
    const { name, email } = req.body;

    span.setAttributes({
      'custom.endpoint': 'create_user',
      'user.name': name || 'unknown',
      'user.email': email || 'unknown',
    });

    logWithTrace(SeverityNumber.INFO, 'Creating new user', {
      endpoint: 'create_user',
      name: name || 'missing',
      email: email || 'missing',
    });

    // Simulate validation
    if (!name || !email) {
      const missingField = !name ? 'name' : 'email';

      span.setAttributes({
        'validation.failed': true,
        'validation.missing_fields': missingField,
      });

      // Record user operation metric for validation failure
      userOperationsTotal.add(1, {
        operation: 'create_user',
        status: 'validation_failed',
      });

      logWithTrace(SeverityNumber.WARN, 'User creation validation failed', {
        endpoint: 'create_user',
        missingField: missingField,
        statusCode: 400,
      });

      res.status(400).json({ error: 'Name and email are required' });
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Validation failed' });
      span.end();
      return;
    }

    // Simulate user creation
    const createSpan = tracer.startSpan('database_insert', { parent: span });
    createSpan.setAttributes({
      'db.operation': 'INSERT',
      'db.table': 'users',
    });

    setTimeout(() => {
      createSpan.end();

      const newUser = {
        id: Math.floor(Math.random() * 1000),
        name,
        email,
        created_at: new Date().toISOString(),
      };

      span.setAttributes({
        'user.created_id': newUser.id,
        'validation.passed': true,
      });

      // Record user operation metric for successful creation
      userOperationsTotal.add(1, {
        operation: 'create_user',
        status: 'success',
      });

      logWithTrace(SeverityNumber.INFO, 'User created successfully', {
        endpoint: 'create_user',
        userId: newUser.id,
        name: newUser.name,
        email: newUser.email,
        statusCode: 201,
      });

      res.status(201).json(newUser);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }, 150); // Simulate 150ms database insert

  } catch (error) {
    logWithTrace(SeverityNumber.ERROR, 'Error creating user', {
      endpoint: 'create_user',
      error: error.message,
    });

    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    res.status(500).json({ error: 'Internal server error' });
    span.end();
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  }

  logWithTrace(SeverityNumber.ERROR, 'Unhandled error occurred', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes({
      'http.status_code': 404,
      'custom.not_found': true,
    });
  }

  logWithTrace(SeverityNumber.WARN, 'Route not found', {
    url: req.url,
    method: req.method,
    statusCode: 404,
  });

  res.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log('📊 OpenTelemetry tracing enabled');
  console.log('\nAvailable endpoints:');
  console.log('  GET  /');
  console.log('  GET  /health');
  console.log('  GET  /api/users/:id');
  console.log('  POST /api/users');

  // Log server startup
  logWithTrace(SeverityNumber.INFO, 'HTTP server started successfully', {
    port: port,
    endpoints: ['/', '/health', '/api/users/:id', '/api/users'],
    environment: process.env.NODE_ENV || 'development',
  });
});
