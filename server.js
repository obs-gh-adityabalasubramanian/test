// Import tracing first to ensure instrumentation is set up before other imports
require('./tracing');

const express = require('express');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { metricsHelper } = require('./metrics');
const { logger, loggerHelper } = require('./logger');

const app = express();
const port = process.env.PORT || 3000;

// Get a tracer instance
const tracer = trace.getTracer('http-server', '1.0.0');

// Middleware to parse JSON bodies
app.use(express.json());

// Add observability middleware
app.use(loggerHelper.createLoggingMiddleware());
app.use(metricsHelper.createMetricsMiddleware());

// Custom middleware to add additional span attributes
app.use((req, res, next) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes({
      'http.user_agent': req.get('User-Agent') || 'unknown',
      'http.request_id': req.get('X-Request-ID') || req.get('x-request-id') || 'none',
    });
  }
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

    logger.info('Processing root request', {
      endpoint: '/',
      method: 'GET',
    });

    const response = {
      message: 'Hello from OpenTelemetry instrumented server!',
      timestamp: new Date().toISOString(),
      traceId: span.spanContext().traceId,
    };

    res.json(response);
    span.setStatus({ code: SpanStatusCode.OK });

    loggerHelper.logBusinessEvent('root_request_completed', {
      traceId: span.spanContext().traceId,
    });

  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    loggerHelper.logError(error, { endpoint: '/', method: 'GET' });
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

    logger.info('Starting health check', {
      endpoint: '/health',
      method: 'GET',
    });

    // Simulate some work
    const startTime = Date.now();

    // Add a child span for the health check logic
    const childSpan = tracer.startSpan('perform_health_checks', { parent: span });

    // Simulate checking database, external services, etc.
    setTimeout(() => {
      const duration = Date.now() - startTime;

      childSpan.setAttributes({
        'health.database': 'ok',
        'health.external_service': 'ok',
      });
      childSpan.end();

      // Record database operation metrics
      metricsHelper.recordDatabaseOperation('HEALTH_CHECK', 'system', duration, true);

      span.setAttributes({
        'health.check_duration_ms': duration,
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
      span.setStatus({ code: SpanStatusCode.OK });

      logger.info('Health check completed', {
        status: 'healthy',
        duration,
        checks: response.checks,
      });

      loggerHelper.logBusinessEvent('health_check_completed', {
        status: 'healthy',
        duration,
      });

      span.end();
    }, 50); // Simulate 50ms of work

  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    loggerHelper.logError(error, { endpoint: '/health', method: 'GET' });
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

    logger.info('Getting user by ID', {
      endpoint: '/api/users/:id',
      userId,
      method: 'GET',
    });

    // Simulate user lookup
    const userSpan = tracer.startSpan('database_lookup', { parent: span });
    userSpan.setAttributes({
      'db.operation': 'SELECT',
      'db.table': 'users',
      'db.query_id': userId,
    });

    const dbStartTime = Date.now();

    // Simulate database delay
    setTimeout(() => {
      const dbDuration = Date.now() - dbStartTime;
      userSpan.end();

      if (userId === '404') {
        span.setAttributes({
          'user.found': false,
        });

        // Record metrics and logs for not found case
        metricsHelper.recordDatabaseOperation('SELECT', 'users', dbDuration, false);
        loggerHelper.logUserOperation('get_user', userId, false, { reason: 'not_found' });

        res.status(404).json({ error: 'User not found' });
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'User not found' });
      } else {
        span.setAttributes({
          'user.found': true,
          'user.name': `User ${userId}`,
        });

        // Record successful metrics and logs
        metricsHelper.recordDatabaseOperation('SELECT', 'users', dbDuration, true);
        metricsHelper.recordUserOperation('get_user', true, userId);

        const response = {
          id: userId,
          name: `User ${userId}`,
          email: `user${userId}@example.com`,
          timestamp: new Date().toISOString(),
        };

        res.json(response);
        span.setStatus({ code: SpanStatusCode.OK });

        logger.info('User retrieved successfully', {
          userId,
          dbDuration,
        });
      }

      span.end();
    }, 100); // Simulate 100ms database lookup

  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    loggerHelper.logError(error, { endpoint: '/api/users/:id', userId: req.params.id });
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

    logger.info('Creating new user', {
      endpoint: '/api/users',
      method: 'POST',
      hasName: !!name,
      hasEmail: !!email,
    });

    // Simulate validation
    if (!name || !email) {
      const missingField = !name ? 'name' : 'email';

      span.setAttributes({
        'validation.failed': true,
        'validation.missing_fields': missingField,
      });

      // Record validation error metrics and logs
      metricsHelper.recordValidationError(missingField, '/api/users');
      loggerHelper.logValidationError(missingField, req.body[missingField], '/api/users');

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

    const dbStartTime = Date.now();

    setTimeout(() => {
      const dbDuration = Date.now() - dbStartTime;
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

      // Record successful metrics and logs
      metricsHelper.recordDatabaseOperation('INSERT', 'users', dbDuration, true);
      metricsHelper.recordUserOperation('create_user', true, newUser.id);

      loggerHelper.logUserOperation('create_user', newUser.id, true, {
        name,
        email,
        dbDuration,
      });

      loggerHelper.logBusinessEvent('user_created', {
        userId: newUser.id,
        name,
        email,
      });

      res.status(201).json(newUser);
      span.setStatus({ code: SpanStatusCode.OK });

      logger.info('User created successfully', {
        userId: newUser.id,
        dbDuration,
      });

      span.end();
    }, 150); // Simulate 150ms database insert

  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    loggerHelper.logError(error, { endpoint: '/api/users', method: 'POST', body: req.body });
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

  // Log the error with full context
  loggerHelper.logError(err, {
    method: req.method,
    url: req.url,
    path: req.path,
    userAgent: req.get('User-Agent'),
    requestId: req.get('X-Request-ID') || req.get('x-request-id'),
    ip: req.ip || req.connection.remoteAddress,
  });

  // Log security event for potential attacks
  if (err.status === 400 || err.message.includes('invalid') || err.message.includes('malformed')) {
    loggerHelper.logSecurityEvent('potential_attack', {
      error: err.message,
      method: req.method,
      url: req.url,
      ip: req.ip || req.connection.remoteAddress,
    });
  }

  console.error('Unhandled error:', err);
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

  // Log 404 events for monitoring
  logger.warn('Route not found', {
    method: req.method,
    url: req.url,
    path: req.path,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    statusCode: 404,
  });

  res.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
  const startupMessage = `🚀 Server running on http://localhost:${port}`;
  console.log(startupMessage);
  console.log('📊 OpenTelemetry tracing enabled');
  console.log('📈 Metrics collection enabled');
  console.log('📝 Structured logging enabled');
  console.log('\nAvailable endpoints:');
  console.log('  GET  /');
  console.log('  GET  /health');
  console.log('  GET  /api/users/:id');
  console.log('  POST /api/users');
  console.log('  GET  /metrics (Prometheus metrics)');

  // Log server startup event
  logger.info('Server started successfully', {
    port,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    pid: process.pid,
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? 'configured' : 'not_configured',
  });

  loggerHelper.logBusinessEvent('server_started', {
    port,
    environment: process.env.NODE_ENV || 'development',
  });
});
