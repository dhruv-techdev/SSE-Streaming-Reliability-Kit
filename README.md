<div align="center">

# SSE Streaming Reliability Kit 🛰️

### Battle-tested Server-Sent Events that survive the real world.

Reconnection, resume, deduplication, ordering, and observability — **out of the box**.

<br/>

[![CI](https://github.com/dhruv-techdev/SSE-Streaming-Reliability-Kit/actions/workflows/ci.yml/badge.svg)](https://github.com/dhruv-techdev/SSE-Streaming-Reliability-Kit/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/sse-streaming-reliability-kit.svg)](https://badge.fury.io/js/sse-streaming-reliability-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Zero Deps](https://img.shields.io/badge/client-zero%20dependencies-brightgreen.svg)](#features)

<br/>

[**Quick Start**](#-5-minute-quick-start) ·
[**Features**](#-features) ·
[**Integration**](#-integration-guide) ·
[**Config**](#-configuration-reference) ·
[**API**](#-api-surface) ·
[**Docs**](#-documentation)

</div>

---

## ✨ Why this kit?

Server-Sent Events are simple — until the network isn't. Connections drop, events arrive twice,
clients miss what happened while they were away, and you have no idea why. This kit handles all of
that for you, so your streams **just keep working**.

```mermaid
flowchart LR
    subgraph Server["🖥️  Server"]
        W[SSE Writer] --> RB[(Replay Buffer)]
        HB[Heartbeat] --> W
    end
    Server -- "events + Last-Event-ID" --> Net((🌐 Network))
    Net --> Client
    subgraph Client["💻  Client"]
        RM[Reconnect Manager] --> DD[Dedupe Cache]
        DD --> OG[Ordering Guard]
        OG --> APP[Your onEvent handler]
    end
    style Server fill:#0d1117,stroke:#30363d,color:#e6edf3
    style Client fill:#0d1117,stroke:#30363d,color:#e6edf3
    style Net fill:#1f6feb,stroke:#1f6feb,color:#fff
```

---

## 📑 Table of Contents

- [Features](#-features)
- [5-Minute Quick Start](#-5-minute-quick-start)
- [Installation](#-installation)
- [Integration Guide](#-integration-guide)
  - [Client Integration](#client-integration)
  - [Server Integration](#server-integration)
- [Configuration Reference](#-configuration-reference)
- [Examples](#-examples)
- [API Surface](#-api-surface)
- [Compatibility Notes](#-compatibility-notes)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🚀 Features

| Feature                   | Description                                                |
| :------------------------ | :--------------------------------------------------------- |
| 🔄 **Auto-Reconnection**  | Exponential backoff with jitter, configurable retry limits |
| ⏩ **Resume Support**     | `Last-Event-ID` tracking with a server-side replay buffer  |
| 🧹 **Deduplication**      | Bounded LRU cache prevents duplicate event processing      |
| 📊 **Observability**      | Prometheus metrics + structured JSON logging               |
| 💓 **Liveness Detection** | Heartbeat monitoring with configurable timeouts            |
| 🔗 **Correlation IDs**    | `stream_id` and `trace_id` for distributed tracing         |
| 🧪 **Fault Injection**    | Test harness with pre-built failure scenarios              |
| ⚡ **Zero Dependencies**  | Client ships with no runtime dependencies                  |

---

## ⏱️ 5-Minute Quick Start

> Get a reliable SSE stream running in five minutes.

### 1️⃣ Clone and Install

```bash
git clone https://github.com/dhruv-techdev/SSE-Streaming-Reliability-Kit.git
cd SSE-Streaming-Reliability-Kit
npm install
```

### 2️⃣ Start the Server

```bash
npm run dev
```

You should see:

```
╔═══════════════════════════════════════════════════════════╗
║           SSE Streaming Reliability Kit v1.0.0            ║
╠═══════════════════════════════════════════════════════════╣
║  Server:     http://0.0.0.0:3000                          ║
║  Stream:     http://0.0.0.0:3000/stream                   ║
╚═══════════════════════════════════════════════════════════╝
```

### 3️⃣ Connect a Client

In a new terminal:

```bash
npm run client:demo
```

You'll see events flowing:

```
[CONNECTED] to http://localhost:3000/stream
[EVENT] domain.tick #1 { ts: 1234567890 }
[EVENT] domain.tick #2 { ts: 1234567891 }
...
```

### 4️⃣ Test Reliability

Kill the server (<kbd>Ctrl</kbd>+<kbd>C</kbd>) and restart it. Watch the client:

- ✅ Automatically reconnect with exponential backoff
- ✅ Resume from the last event (no gaps!)
- ✅ Continue processing without duplicates

> **That's it!** You now have a reliable SSE stream. 🎉

---

## 📦 Installation

```bash
npm install sse-streaming-reliability-kit
```

Or with yarn:

```bash
yarn add sse-streaming-reliability-kit
```

---

## 🔌 Integration Guide

### Client Integration

<details open>
<summary><strong>Basic Client</strong></summary>

```javascript
import { connectSSE } from 'sse-streaming-reliability-kit/client';

const connector = connectSSE('https://api.example.com/events', {
  // Called for each domain event
  onEvent: (event) => {
    console.log(`[${event.type}]`, event.payload);
  },

  // Called on successful connection
  onOpen: ({ url, reconnectCount }) => {
    console.log(`Connected to ${url} (reconnect #${reconnectCount})`);
  },

  // Called on disconnect
  onClose: ({ reason, willReconnect, retryIn }) => {
    console.log(`Disconnected: ${reason}`);
    if (willReconnect) {
      console.log(`Reconnecting in ${retryIn}ms...`);
    }
  },

  // Called on errors
  onError: (err) => {
    console.error('Error:', err);
  },
});

// Later: stop the connection
connector.stop();
```

</details>

<details>
<summary><strong>Client with All Options</strong></summary>

```javascript
import {
  connectSSE,
  FileStorage,
  createInMemorySink,
  OrderingRule,
  CannotResumeFallback,
} from 'sse-streaming-reliability-kit/client';

const metricsSink = createInMemorySink();

const connector = connectSSE('https://api.example.com/events', {
  // === Retry Policy ===
  retryPolicy: {
    baseDelayMs: 1000, // Initial retry delay
    maxDelayMs: 30000, // Maximum retry delay
    maxAttempts: 10, // Give up after N attempts
    maxRetryTimeMs: 300000, // Give up after 5 minutes total
    jitterPct: 0.2, // 20% jitter
  },

  // === Resume ===
  persistLastEventId: true,
  eventIdStorage: new FileStorage('./last-event-id.txt'),
  cannotResumeFallback: CannotResumeFallback.START_FRESH,

  // === Liveness ===
  enableLivenessCheck: true,
  livenessTimeoutMs: 30000,
  livenessGracePeriodMs: 5000,

  // === Deduplication ===
  enableDedupe: true,
  dedupeMaxSize: 1000,
  dedupeTtlMs: 60000,

  // === Ordering ===
  enableOrdering: true,
  orderingRule: OrderingRule.SEQUENCE,

  // === Metrics ===
  enableMetrics: true,
  metricsSink: metricsSink,
  trackEventLag: true,

  // === Correlation ===
  traceId: 'my-trace-123',

  // === Callbacks ===
  onEvent: (event) => {
    /* ... */
  },
  onOpen: (info) => {
    /* ... */
  },
  onClose: (info) => {
    /* ... */
  },
  onError: (err) => {
    /* ... */
  },
  onRetry: (info) => {
    /* ... */
  },
  onGiveUp: (info) => {
    /* ... */
  },
  onHeartbeat: (event) => {
    /* ... */
  },
  onControl: (event) => {
    /* ... */
  },
  onDuplicate: (info) => {
    /* ... */
  },
  onOutOfOrder: (info) => {
    /* ... */
  },
  onLivenessFailure: (info) => {
    /* ... */
  },
  onCannotResume: (info) => {
    /* ... */
  },
});

// Access stats
console.log(connector.getStats());
console.log(metricsSink.toJSON());
```

</details>

### Server Integration

<details open>
<summary><strong>Basic Server (Express)</strong></summary>

```javascript
import express from 'express';
import { createSSEWriter, createEnvelope } from 'sse-streaming-reliability-kit/server';

const app = express();

app.get('/events', (req, res) => {
  const writer = createSSEWriter(res);
  writer.init();

  // Send events periodically
  const interval = setInterval(() => {
    writer.sendEvent(
      createEnvelope('domain.update', {
        timestamp: Date.now(),
        data: {
          /* your data */
        },
      })
    );
  }, 1000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(interval);
  });
});

app.listen(3000);
```

</details>

<details>
<summary><strong>Basic Server (Fastify)</strong></summary>

```javascript
import Fastify from 'fastify';
import { createSSEWriter, createEnvelope } from 'sse-streaming-reliability-kit/server';

const app = Fastify();

app.get('/events', (request, reply) => {
  const writer = createSSEWriter(reply.raw);
  writer.init();

  const interval = setInterval(() => {
    writer.sendEvent(
      createEnvelope('domain.update', {
        timestamp: Date.now(),
      })
    );
  }, 1000);

  request.raw.on('close', () => {
    clearInterval(interval);
  });

  reply.hijack();
});

app.listen({ port: 3000 });
```

</details>

<details>
<summary><strong>Server with Replay Buffer</strong></summary>

```javascript
import {
  createSSEWriter,
  createReplayBuffer,
  createEnvelope,
} from 'sse-streaming-reliability-kit/server';

// Create a shared replay buffer
const replayBuffer = createReplayBuffer({
  maxSize: 1000,
  maxReplayBatch: 100,
  ttlMs: 300000, // 5 minutes
});

app.get('/events', (req, res) => {
  const writer = createSSEWriter(res);
  writer.init();

  // Check for Last-Event-ID
  const lastEventId = req.headers['last-event-id'];

  if (lastEventId) {
    const replay = replayBuffer.getEventsAfter(lastEventId);

    if (!replay.found) {
      // Event not in buffer - send cannot-resume
      writer.sendControl('cannot_resume', {
        code: 'event_not_found',
        requestedId: lastEventId,
      });
    } else {
      // Replay missed events
      for (const event of replay.events) {
        writer.sendEvent(event);
      }
    }
  }

  // Send new events and add to buffer
  const interval = setInterval(() => {
    const event = createEnvelope('domain.update', { ts: Date.now() });
    writer.sendEvent(event);
    replayBuffer.add(event);
  }, 1000);

  req.on('close', () => clearInterval(interval));
});
```

</details>

---

## ⚙️ Configuration Reference

### Client Configuration

| Option                       | Type         | Default              | Description                                          |
| :--------------------------- | :----------- | :------------------- | :--------------------------------------------------- |
| **Retry Policy**             |              |                      |                                                      |
| `retryPolicy.baseDelayMs`    | number       | `1000`               | Initial retry delay in ms                            |
| `retryPolicy.maxDelayMs`     | number       | `30000`              | Maximum retry delay in ms                            |
| `retryPolicy.maxAttempts`    | number       | `Infinity`           | Max retry attempts before give-up                    |
| `retryPolicy.maxRetryTimeMs` | number       | `Infinity`           | Max total retry time before give-up                  |
| `retryPolicy.jitterPct`      | number       | `0.2`                | Jitter percentage (0–1)                              |
| **Resume**                   |              |                      |                                                      |
| `persistLastEventId`         | boolean      | `false`              | Persist `Last-Event-ID` across restarts              |
| `eventIdStorage`             | Storage      | `MemoryStorage`      | Storage adapter for `Last-Event-ID`                  |
| `cannotResumeFallback`       | string       | `'start_fresh'`      | On cannot-resume: `start_fresh`, `close`, `callback` |
| **Liveness**                 |              |                      |                                                      |
| `enableLivenessCheck`        | boolean      | `true`               | Enable heartbeat-based liveness detection            |
| `livenessTimeoutMs`          | number       | `30000`              | Time without heartbeat before failure                |
| `livenessGracePeriodMs`      | number       | `5000`               | Grace period before first check                      |
| **Deduplication**            |              |                      |                                                      |
| `enableDedupe`               | boolean      | `true`               | Enable duplicate event detection                     |
| `dedupeMaxSize`              | number       | `1000`               | Max events in dedupe cache                           |
| `dedupeTtlMs`                | number       | `0`                  | TTL for dedupe entries (`0` = no expiry)             |
| **Ordering**                 |              |                      |                                                      |
| `enableOrdering`             | boolean      | `true`               | Enable ordering enforcement                          |
| `orderingRule`               | OrderingRule | `SEQUENCE`           | Rule: `SEQUENCE`, `EVENT_ID`, `TIMESTAMP`, `NONE`    |
| `outOfOrderPolicy`           | Policy       | `DROP_WITH_CALLBACK` | `DROP`, `DROP_WITH_CALLBACK`, `ACCEPT`               |
| **Metrics**                  |              |                      |                                                      |
| `enableMetrics`              | boolean      | `true`               | Enable metrics collection                            |
| `metricsSink`                | MetricsSink  | `NoOpSink`           | Metrics sink implementation                          |
| `trackEventLag`              | boolean      | `true`               | Track event delivery lag                             |
| **Other**                    |              |                      |                                                      |
| `timeout`                    | number       | `60000`              | Connection timeout in ms                             |
| `autoReconnect`              | boolean      | `true`               | Auto-reconnect on disconnect                         |
| `traceId`                    | string       | `null`               | Trace ID for correlation                             |
| `headers`                    | object       | `{}`                 | Additional HTTP headers                              |
| `debug`                      | boolean      | `false`              | Enable debug logging                                 |

### Server Configuration

| Environment Variable     | Type   | Default     | Description                                 |
| :----------------------- | :----- | :---------- | :------------------------------------------ |
| `PORT`                   | number | `3000`      | Server port                                 |
| `HOST`                   | string | `'0.0.0.0'` | Server host                                 |
| `SSE_TICK_INTERVAL`      | number | `1000`      | Event emission interval (ms)                |
| `SSE_HEARTBEAT_INTERVAL` | number | `15000`     | Heartbeat interval (ms)                     |
| `SSE_RETRY_TIMEOUT`      | number | `3000`      | Suggested retry timeout (ms)                |
| `SSE_MAX_BUFFER_SIZE`    | number | `1000`      | Max events in replay buffer                 |
| `SSE_MAX_REPLAY_BATCH`   | number | `100`       | Max events per replay                       |
| `SSE_BUFFER_TTL_MS`      | number | `0`         | Buffer TTL (`0` = no expiry)                |
| `MAX_CONNECTIONS`        | number | `1000`      | Max concurrent connections                  |
| `LOG_LEVEL`              | string | `'info'`    | Log level: `debug`, `info`, `warn`, `error` |

### Storage Adapters

```javascript
import {
  MemoryStorage, // In-memory (default, no persistence)
  FileStorage, // File-based persistence
  LocalStorageAdapter, // Browser localStorage
} from 'sse-streaming-reliability-kit/client';

// Memory (default)
const memory = new MemoryStorage();

// File
const file = new FileStorage('./last-event-id.txt');

// localStorage (browser)
const local = new LocalStorageAdapter('my-stream');
```

---

## 🧰 Examples

<details open>
<summary><strong>Example 1 — Basic Event Stream</strong></summary>

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Connect client
npm run client:demo
```

</details>

<details>
<summary><strong>Example 2 — Test Reconnection</strong></summary>

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Connect client
npm run client:demo

# Terminal 3: Kill and restart server
# The client will automatically reconnect!
```

</details>

<details>
<summary><strong>Example 3 — Test Resume</strong></summary>

```javascript
// client-resume-test.js
import { connectSSE, FileStorage } from 'sse-streaming-reliability-kit/client';

const connector = connectSSE('http://localhost:3000/stream', {
  persistLastEventId: true,
  eventIdStorage: new FileStorage('./last-event-id.txt'),
  onEvent: (e) => console.log(`Event #${e.sequence}`),
  onResumeAttempt: ({ lastEventId }) => {
    console.log(`Resuming from: ${lastEventId}`);
  },
});

// Stop after 5 seconds
setTimeout(() => {
  console.log('Stopping...');
  connector.stop();

  // Restart after 2 seconds - will resume!
  setTimeout(() => {
    console.log('Restarting...');
    connector.connect();
  }, 2000);
}, 5000);
```

</details>

<details>
<summary><strong>Example 4 — Monitor Metrics</strong></summary>

```javascript
import { connectSSE, createInMemorySink } from 'sse-streaming-reliability-kit/client';

const sink = createInMemorySink();

const connector = connectSSE('http://localhost:3000/stream', {
  metricsSink: sink,
  onEvent: () => {},
});

// Print metrics every 10 seconds
setInterval(() => {
  const stats = connector.getStats();
  console.log('Stats:', {
    events: stats.eventsReceived,
    reconnects: stats.reconnectCount,
    duplicates: stats.duplicatesIgnored,
    lag: stats.lag,
  });
}, 10000);
```

</details>

<details>
<summary><strong>Example 5 — Run Fault Injection Scenarios</strong></summary>

```bash
# List available scenarios
npm run harness list

# Run a specific scenario
npm run harness run drop-mid-stream

# Run all scenarios
npm run harness run-all

# Run scenarios by tag
npm run harness run-tag reconnect
```

</details>

---

## 🧩 API Surface

<details>
<summary><strong>Client Exports</strong></summary>

```javascript
import {
  // Main
  SSEConnector,
  connectSSE,

  // State Machine
  ConnectionState, // 'idle' | 'connecting' | 'open' | 'retrying' | 'closed'
  TransitionReason,
  StateMachine,

  // Retry
  RetryPolicy,
  RetryPolicies, // { AGGRESSIVE, STANDARD, CONSERVATIVE }
  DEFAULT_RETRY_POLICY,
  ReconnectManager,
  GiveUpReason,

  // Liveness
  LivenessMonitor,
  createLivenessMonitor,

  // Resume
  EventIdStore,
  createEventIdStore,
  MemoryStorage,
  FileStorage,
  LocalStorageAdapter,
  CannotResumeFallback, // 'start_fresh' | 'close' | 'callback'

  // Dedupe
  DedupeCache,
  createDedupeCache,
  DEDUPE_DEFAULTS,

  // Ordering
  OrderingGuard,
  createOrderingGuard,
  OrderingRule, // SEQUENCE | EVENT_ID | TIMESTAMP | NONE
  OutOfOrderPolicy, // DROP | DROP_WITH_CALLBACK | ACCEPT

  // Metrics
  ClientMetrics,
  createClientMetrics,
  MetricsSink,
  ConsoleMetricsSink,
  InMemoryMetricsSink,
  createConsoleSink,
  createInMemorySink,

  // Logging
  createClientLogger,
  getClientLogger,
} from 'sse-streaming-reliability-kit/client';
```

</details>

<details>
<summary><strong>Server Exports</strong></summary>

```javascript
import {
  // SSE Writer
  createSSEWriter,

  // Stream Management
  createStreamManager,

  // Connection Registry
  getRegistry,
  createRegistry,

  // Replay Buffer
  createReplayBuffer,

  // Heartbeat
  HeartbeatScheduler,
  createHeartbeatScheduler,

  // Metrics
  MetricsRegistry,
  getMetrics,
  createMetrics,

  // Logging
  createServerLogger,
  getServerLogger,

  // Config
  config,
} from 'sse-streaming-reliability-kit/server';
```

</details>

<details>
<summary><strong>Shared Exports</strong></summary>

```javascript
import {
  // Event Types
  ReservedEventTypes, // { HEARTBEAT, ERROR }
  RESERVED_PREFIXES, // ['system.', 'control.']
  isDomainEventType,
  isHeartbeatEvent,

  // Constants
  Defaults,
  DisconnectReason,
  CannotResumeReason,

  // Event ID
  generateEventId,
  extractTimestamp,
  isValidEventId,

  // Schema
  eventEnvelopeSchema,
  validateEvent,

  // Envelope
  createEnvelope,
  createHeartbeat,
  createError,
  createControl,
  createDomainEvent,
  encodeSSE,
  decodeSSE,
  parseSSEChunk,

  // Logging
  Logger,
  createLogger,
  LogLevel,
  LogComponent,
  LogEvent,

  // Correlation
  generateStreamId,
  extractTraceId,
  createCorrelationContext,
} from 'sse-streaming-reliability-kit/shared';
```

</details>

---

## 🔍 Compatibility Notes

### ✅ What This Kit Is

- An **SSE (Server-Sent Events) reliability toolkit**
- Handles reconnection, resume, and deduplication
- Works with any SSE-compatible server
- Production-ready, with observability built in

### ❌ What This Kit Is _Not_

- **Not a WebSocket library** — SSE is unidirectional (server → client)
- **Not a message queue** — no persistence guarantees beyond buffer TTL
- **Not a database** — the replay buffer is in-memory by default
- **Not bidirectional** — use WebSockets or HTTP POST for client → server

### 🌍 Environment Support

| Environment | Support     | Notes                                                |
| :---------- | :---------- | :--------------------------------------------------- |
| Node.js 18+ | ✅ Full     | Primary target                                       |
| Node.js 20+ | ✅ Full     | Recommended                                          |
| Browsers    | ⚠️ Partial  | Client only — use native `EventSource` or an adapter |
| Deno        | ⚠️ Untested | Should work, not officially supported                |
| Bun         | ⚠️ Untested | Should work, not officially supported                |

### 📐 Protocol Limitations

- **Event size** — no hard limit, but keep under 64 KB for compatibility
- **Replay buffer** — in-memory, lost on server restart
- **Ordering** — sequence numbers may have gaps after resume
- **Heartbeats** — required for liveness detection

### 🌐 Browser Usage

The client is designed for Node.js. For browsers, you have two options:

**Option 1 — Use native `EventSource` with manual retry**

```javascript
const es = new EventSource('/stream');
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

**Option 2 — Bundle the client (advanced)**

```javascript
// Requires bundler configuration for Node.js polyfills
import { SSEConnector } from 'sse-streaming-reliability-kit/client';
```

---

## 📚 Documentation

| Document                                   | Description               |
| :----------------------------------------- | :------------------------ |
| [Getting Started](docs/getting-started.md) | Quick introduction        |
| [Configuration](docs/configuration.md)     | All configuration options |
| [Metrics](docs/metrics.md)                 | Server and client metrics |
| [Logging](docs/logging.md)                 | Structured logging guide  |
| [Versioning](docs/versioning.md)           | SemVer policy             |
| [CI Pipeline](docs/ci.md)                  | CI/CD documentation       |
| [Changelog](CHANGELOG.md)                  | Version history           |

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Run tests
npm test

# Run linter
npm run lint

# Run harness
npm run harness:all

# Full CI check
npm run ci
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

<div align="center">

<br/>

**Made with ❤️ for reliable real-time streaming.**

<sub>If this kit saved you a 2 a.m. pager, consider giving it a ⭐</sub>

</div>
