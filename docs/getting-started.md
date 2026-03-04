# Getting Started

Get a reliable SSE stream running in 5 minutes.

## Prerequisites

- Node.js 18 or later
- npm or yarn

## Quick Start

### 1. Install

```bash
npm install sse-streaming-reliability-kit
```

### 2. Create a Server

Create `server.js`:

```javascript
import Fastify from 'fastify';
import { createSSEWriter, generateEventId } from 'sse-streaming-reliability-kit/server';

const app = Fastify();

app.get('/events', (request, reply) => {
  const writer = createSSEWriter(reply.raw);
  writer.init();

  let seq = 0;
  const interval = setInterval(() => {
    writer.sendEvent({
      event_id: generateEventId(),
      type: 'domain.update',
      ts: new Date().toISOString(),
      sequence: ++seq,
      payload: { value: Math.random() },
    });
  }, 1000);

  request.raw.on('close', () => clearInterval(interval));
  reply.hijack();
});

app.listen({ port: 3000 });
console.log('Server: http://localhost:3000/events');
```

### 3. Create a Client

Create `client.js`:

```javascript
import { connectSSE } from 'sse-streaming-reliability-kit/client';

const connector = connectSSE('http://localhost:3000/events', {
  onEvent: (e) => console.log(`Event #${e.sequence}:`, e.payload),
  onOpen: () => console.log('Connected!'),
  onClose: ({ willReconnect }) => console.log('Disconnected, reconnect:', willReconnect),
});
```

### 4. Run

```bash
# Terminal 1
node server.js

# Terminal 2
node client.js
```

### 5. Test Reliability

1. Kill the server (Ctrl+C)
2. Watch the client retry
3. Restart the server
4. Client reconnects automatically!

## Next Steps

- [Full README](../README.md) - Complete documentation
- [Configuration](configuration.md) - All options
- [Examples](../examples/) - More code examples
- [API Reference](../README.md#api-surface) - Exports reference
