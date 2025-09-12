# OpenTelemetry Instrumented HTTP Server

A simple HTTP server built with Express.js and instrumented with OpenTelemetry for observability.

## Features

- **Automatic Instrumentation**: HTTP requests, Express routes, and other Node.js modules are automatically instrumented
- **Custom Spans**: Manual spans for business logic with custom attributes
- **Error Tracking**: Exceptions and errors are captured in traces
- **Multiple Endpoints**: Various endpoints demonstrating different instrumentation patterns
- **Console Export**: Traces are exported to console for easy debugging (can be configured for other exporters)

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

The server will start on `http://localhost:3001` (or the port specified in the `PORT` environment variable).

## Testing the Instrumentation

1. Start the server:
   ```bash
   npm start
   ```

2. Make some requests:
   ```bash
   # Basic request
   curl http://localhost:3001/

   # Health check
   curl http://localhost:3001/health

   # Get user
   curl http://localhost:3001/api/users/123

   # Create user
   curl -X POST http://localhost:3001/api/users \
     -H "Content-Type: application/json" \
     -d '{"name": "John Doe", "email": "john@example.com"}'

   # Test error case
   curl http://localhost:3001/api/users/404
   ```

3. Check the console output to see the OpenTelemetry traces with spans, attributes, and timing information.

## Configuration

### Exporters

The current setup exports traces to the console. To use other exporters:

1. **Jaeger**: Uncomment the Jaeger exporter in `tracing.js` and ensure Jaeger is running locally
2. **OTLP**: Add OTLP exporter for sending to observability platforms like Honeycomb, Datadog, etc.

### Environment Variables

- `PORT`: Server port (default: 3001)
- `OTEL_SERVICE_NAME`: Override service name
- `OTEL_EXPORTER_*`: Various OpenTelemetry configuration options

## Trace Information

Each trace includes:
- **Automatic attributes**: HTTP method, URL, status code, user agent
- **Custom attributes**: Business logic identifiers, operation results
- **Timing information**: Request duration, database operation timing
- **Error information**: Exception details and error messages
- **Span hierarchy**: Parent-child relationships between operations

## Next Steps

- Add metrics collection with OpenTelemetry metrics
- Implement distributed tracing across multiple services
- Add custom instrumentation for external API calls
- Configure proper observability backend (Jaeger, Zipkin, cloud providers)
