// Import tracing first to ensure instrumentation is set up before other imports
require('./tracing');

const express = require('express');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');

const app = express();
const port = process.env.PORT || 3000;

// Get a tracer instance
const tracer = trace.getTracer('http-server', '1.0.0');

// Middleware to parse JSON bodies
app.use(express.json());

// Custom middleware to add additional span attributes
app.use((req, res, next) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes({
      'http.user_agent': req.get('User-Agent') || 'unknown',
      'http.request_id': req.get('X-Request-ID') || 'none',
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
    
    res.json({
      message: 'Hello from OpenTelemetry instrumented server!',
      timestamp: new Date().toISOString(),
      traceId: span.spanContext().traceId,
    });
    
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
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
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'ok',
          external_service: 'ok',
        },
        duration_ms: duration,
      });
      
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }, 50); // Simulate 50ms of work
    
  } catch (error) {
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
        res.status(404).json({ error: 'User not found' });
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'User not found' });
      } else {
        span.setAttributes({
          'user.found': true,
          'user.name': `User ${userId}`,
        });
        
        res.json({
          id: userId,
          name: `User ${userId}`,
          email: `user${userId}@example.com`,
          timestamp: new Date().toISOString(),
        });
        
        span.setStatus({ code: SpanStatusCode.OK });
      }
      
      span.end();
    }, 100); // Simulate 100ms database lookup
    
  } catch (error) {
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
    
    // Simulate validation
    if (!name || !email) {
      span.setAttributes({
        'validation.failed': true,
        'validation.missing_fields': !name ? 'name' : 'email',
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
      
      res.status(201).json(newUser);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }, 150); // Simulate 150ms database insert
    
  } catch (error) {
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
});
