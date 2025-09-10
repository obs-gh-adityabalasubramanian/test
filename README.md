# OpenTelemetry Instrumented HTTP Server

A simple HTTP server built with Express.js and instrumented with OpenTelemetry for observability.

## Features

- **Automatic Instrumentation**: HTTP requests, Express routes, and other Node.js modules are automatically instrumented
- **Custom Spans**: Manual spans for business logic with custom attributes
- **Structured Logging**: JSON-formatted logs with trace correlation for observability platforms
- **Comprehensive Metrics**: Request latency, throughput, error rates, and business metrics
- **Error Tracking**: Exceptions and errors are captured in traces with full context
- **Multiple Endpoints**: Various endpoints demonstrating different instrumentation patterns
- **OTLP Export**: Traces, metrics, and logs are exported via OTLP to observability platforms

## Endpoints

- `GET /` - Root endpoint with basic tracing
- `GET /health` - Health check with simulated async operations
- `GET /api/users/:id` - Get user by ID with database simulation
- `POST /api/users` - Create user with validation and database simulation

## Installation

```bash
npm install
```

## Running the Server

```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in the `PORT` environment variable).

## Testing the Instrumentation

1. Start the server:
   ```bash
   npm start
   ```

2. Make some requests:
   ```bash
   # Basic request
   curl http://localhost:3000/

   # Health check
   curl http://localhost:3000/health

   # Get user
   curl http://localhost:3000/api/users/123

   # Create user
   curl -X POST http://localhost:3000/api/users \
     -H "Content-Type: application/json" \
     -d '{"name": "John Doe", "email": "john@example.com"}'

   # Test error case
   curl http://localhost:3000/api/users/404
   ```

3. Check the console output to see the OpenTelemetry traces with spans, attributes, and timing information.

## Configuration

### OTLP Exporters

The application is configured to export telemetry data via OTLP (OpenTelemetry Protocol) to observability platforms:

- **Traces**: Exported to `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`
- **Metrics**: Exported to `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`
- **Logs**: Exported to `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/logs`

### Environment Variables

- `PORT`: Server port (default: 3000)
- `OTEL_EXPORTER_OTLP_ENDPOINT`: OTLP endpoint URL (default: http://localhost:4318)
- `OTEL_EXPORTER_OTLP_BEARER_TOKEN`: Bearer token for authentication (optional)
- `OTEL_SERVICE_NAME`: Override service name (default: otel-http-server)
- `NODE_ENV`: Environment (development/production)

## Observability Data

### Traces
Each trace includes:
- **Automatic attributes**: HTTP method, URL, status code, user agent, request ID
- **Custom attributes**: Business logic identifiers, operation results, validation status
- **Timing information**: Request duration, database operation timing, health check duration
- **Error information**: Exception details and error messages with full stack traces
- **Span hierarchy**: Parent-child relationships between operations

### Metrics
The application collects comprehensive metrics:
- `http_requests_total`: Total HTTP requests with method, status code, and route labels
- `http_request_duration_ms`: Request latency histogram
- `http_requests_in_flight`: Current number of active requests
- `user_operations_total`: Business operation counters (get_user, create_user)
- `health_check_duration_ms`: Health check timing

### Logs
Structured JSON logs with trace correlation:
- Request/response logging with trace and span IDs
- Error logging with full context and stack traces
- Business operation logging (user creation, lookups, validation failures)
- Server lifecycle events (startup, shutdown)

## Production Deployment

For production use, configure the following environment variables:
- Set `OTEL_EXPORTER_OTLP_ENDPOINT` to your observability platform's OTLP endpoint
- Set `OTEL_EXPORTER_OTLP_BEARER_TOKEN` for authentication
- Set `NODE_ENV=production` for production optimizations
