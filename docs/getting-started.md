# Getting Started

This guide will help you integrate the SSE Streaming Reliability Kit in under 5 minutes.

## Installation

```bash
npm install sse-streaming-reliability-kit
```

## Minimal Server

```javascript
import Fastify from 'fastify';
import { createSSEWriter, createEnvelope } from 'sse-streaming-reliability-kit/server';

const app = Fastify();

app.get('/events', (request, reply) => {
  // Set SSE headers
  const writer = createSSEWriter(reply.raw);
  writer.init();

  // Send periodic events
  const interval = setInterval(() => {
    writer.sendEvent(
      createEnvelope('domain.tick', {
        timestamp: Date.now(),
      })
    );
  }, 1000);

  // Cleanup on disconnect
  request.raw.on('close', () => {
    clearInterval(interval);
  });

  reply.hijack();
});

app.listen({ port: 3000 });
console.log('Server running at http://localhost:3000');
```

## Minimal Client

```javascript
import { connectSSE } from 'sse-streaming-reliability-kit/client';

const connector = connectSSE('http://localhost:3000/events', {
  onEvent: (event) => {
    console.log('Event:', event.type, event.payload);
  },
  onOpen: () => {
    console.log('Connected!');
  },
  onClose: ({ willReconnect }) => {
    console.log('Disconnected, will reconnect:', willReconnect);
  },
});

// Stop when done
// connector.stop();
```

## What You Get

Out of the box:

- ✅ Automatic reconnection with exponential backoff
- ✅ Resume from last event on reconnect
- ✅ Duplicate event detection
- ✅ Connection state management
- ✅ Error handling

## Next Steps

- [Client API Reference](client-api.md)
- [Server API Reference](server-api.md)
- [Configuration Options](configuration.md)
- [Metrics & Observability](metrics.md)
