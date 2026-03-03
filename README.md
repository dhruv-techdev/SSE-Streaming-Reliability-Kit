# SSE Streaming Reliability Kit

[![CI](https://github.com/your-org/sse-streaming-reliability-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/sse-streaming-reliability-kit/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/sse-streaming-reliability-kit.svg)](https://badge.fury.io/js/sse-streaming-reliability-kit)

A comprehensive Server-Sent Events (SSE) reliability toolkit that handles reconnection, resume, deduplication, and observability out of the box.

## Features

- ��� **Automatic Reconnection** - Exponential backoff with jitter, circuit breaker
- ▶️ **Resume Support** - Last-Event-ID tracking, server-side replay buffer
- ��� **Deduplication** - Bounded LRU cache prevents duplicate processing
- ��� **Observability** - Prometheus metrics, structured logging, correlation IDs
- ��� **Liveness Detection** - Heartbeat monitoring with configurable timeouts
- ��� **Fault Injection** - Test harness with pre-built failure scenarios

## Quick Start

### Installation

```bash
npm install sse-streaming-reliability-kit
```

### 30-Second Example

**Server:**

```javascript
import Fastify from 'fastify';
import { createSSEWriter, createHeartbeat } from 'sse-streaming-reliability-kit/server';

const app = Fastify();

app.get('/stream', (req, reply) => {
  const writer = createSSEWriter(reply.raw);
  writer.init();

  // Send events
  setInterval(() => {
    writer.sendEvent({
      event_id: crypto.randomUUID(),
      type: 'domain.tick',
      ts: new Date().toISOString(),
      payload: { time: Date.now() },
    });
  }, 1000);

  reply.hijack();
});

app.listen({ port: 3000 });
```

**Client:**

```javascript
import { connectSSE } from 'sse-streaming-reliability-kit/client';

const connector = connectSSE('http://localhost:3000/stream', {
  onEvent: (event) => {
    console.log('Received:', event.type, event.payload);
  },
  onError: (err) => {
    console.error('Error:', err);
  },
});

// Auto-reconnects on disconnect!
```

## Documentation

| Topic           | Link                                               |
| --------------- | -------------------------------------------------- |
| Getting Started | [docs/getting-started.md](docs/getting-started.md) |
| Client API      | [docs/client-api.md](docs/client-api.md)           |
| Server API      | [docs/server-api.md](docs/server-api.md)           |
| Configuration   | [docs/configuration.md](docs/configuration.md)     |
| Metrics         | [docs/metrics.md](docs/metrics.md)                 |
| Logging         | [docs/logging.md](docs/logging.md)                 |
| Versioning      | [docs/versioning.md](docs/versioning.md)           |

## Examples

### With Resume Support

```javascript
const connector = connectSSE('http://localhost:3000/stream', {
  persistLastEventId: true,
  eventIdStorage: new FileStorage('./last-event-id.txt'),
  onResumeAttempt: ({ lastEventId }) => {
    console.log('Resuming from:', lastEventId);
  },
});
```

### With Custom Retry Policy

```javascript
const connector = connectSSE('http://localhost:3000/stream', {
  retryPolicy: {
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    maxAttempts: 10,
    maxRetryTimeMs: 300000, // 5 minutes
    jitterPct: 0.2,
  },
});
```

### With Metrics

```javascript
import { createInMemorySink } from 'sse-streaming-reliability-kit/client';

const sink = createInMemorySink();

const connector = connectSSE('http://localhost:3000/stream', {
  metricsSink: sink,
  trackEventLag: true,
});

// Later: check metrics
console.log(sink.toJSON());
console.log(connector.getStats().lag);
```

## Compatibility & Upgrade Notes

### Node.js Compatibility

| Kit Version | Node.js   |
| ----------- | --------- |
| 1.x         | >= 18.0.0 |

### Upgrading

See [CHANGELOG.md](CHANGELOG.md) for upgrade notes between versions.

### Breaking Changes Policy

We follow [Semantic Versioning](https://semver.org/). Breaking changes only occur in MAJOR version bumps and are documented in the changelog with migration guides.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run linter
npm run lint

# Run harness scenarios
npm run harness:all

# Start dev server
npm run dev
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](LICENSE)
