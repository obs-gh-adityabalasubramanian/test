const winston = require('winston');
const { trace, context } = require('@opentelemetry/api');

// Custom format to inject trace information
const traceFormat = winston.format((info) => {
  const span = trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    info.traceId = spanContext.traceId;
    info.spanId = spanContext.spanId;
    info.traceFlags = spanContext.traceFlags;
  }
  
  // Add timestamp if not present
  if (!info.timestamp) {
    info.timestamp = new Date().toISOString();
  }
  
  // Add service information
  info.service = process.env.OTEL_SERVICE_NAME || 'otel-http-server';
  info.version = '1.0.0';
  info.environment = process.env.NODE_ENV || 'development';
  
  return info;
});

// Create Winston logger with structured JSON format
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    traceFormat(),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.OTEL_SERVICE_NAME || 'otel-http-server',
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File transport for structured logs
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.json()
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.json()
    })
  ],
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const path = require('path');
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Enhanced logging functions with context
const loggerHelper = {
  // Log HTTP request start
  logRequestStart: (req) => {
    const requestId = req.get('X-Request-ID') || req.get('x-request-id') || 'unknown';
    logger.info('HTTP request started', {
      method: req.method,
      url: req.url,
      path: req.path,
      userAgent: req.get('User-Agent'),
      requestId,
      ip: req.ip || req.connection.remoteAddress,
      headers: {
        'content-type': req.get('Content-Type'),
        'content-length': req.get('Content-Length'),
        'accept': req.get('Accept'),
      }
    });
  },

  // Log HTTP request completion
  logRequestComplete: (req, res, duration) => {
    const requestId = req.get('X-Request-ID') || req.get('x-request-id') || 'unknown';
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger.log(level, 'HTTP request completed', {
      method: req.method,
      url: req.url,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      requestId,
      responseSize: res.get('Content-Length') || 0,
    });
  },

  // Log database operations
  logDatabaseOperation: (operation, table, duration, success = true, error = null) => {
    const level = success ? 'info' : 'error';
    const message = `Database ${operation} ${success ? 'completed' : 'failed'}`;
    
    const logData = {
      operation: operation.toUpperCase(),
      table,
      duration,
      success,
    };

    if (error) {
      logData.error = {
        message: error.message,
        stack: error.stack,
      };
    }

    logger.log(level, message, logData);
  },

  // Log user operations
  logUserOperation: (operation, userId, success = true, details = {}) => {
    const level = success ? 'info' : 'warn';
    const message = `User ${operation} ${success ? 'completed' : 'failed'}`;
    
    logger.log(level, message, {
      operation,
      userId,
      success,
      ...details,
    });
  },

  // Log validation errors
  logValidationError: (field, value, endpoint, userId = null) => {
    logger.warn('Validation error', {
      field,
      value: typeof value === 'string' ? value.substring(0, 100) : value, // Truncate long values
      endpoint,
      userId,
      type: 'validation_error',
    });
  },

  // Log application errors
  logError: (error, context = {}) => {
    logger.error('Application error', {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...context,
    });
  },

  // Log business events
  logBusinessEvent: (event, data = {}) => {
    logger.info('Business event', {
      event,
      ...data,
      type: 'business_event',
    });
  },

  // Log security events
  logSecurityEvent: (event, details = {}) => {
    logger.warn('Security event', {
      event,
      ...details,
      type: 'security_event',
    });
  },

  // Create middleware for automatic request logging
  createLoggingMiddleware: () => {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Generate request ID if not present
      if (!req.get('X-Request-ID') && !req.get('x-request-id')) {
        req.headers['x-request-id'] = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Log request start
      loggerHelper.logRequestStart(req);

      // Override res.end to log completion
      const originalEnd = res.end;
      res.end = function(chunk, encoding) {
        const duration = Date.now() - startTime;
        loggerHelper.logRequestComplete(req, res, duration);
        originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  },
};

// Export both the raw logger and helper functions
module.exports = {
  logger,
  loggerHelper,
};
