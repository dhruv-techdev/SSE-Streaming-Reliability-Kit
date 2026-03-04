# Configuration Reference

Complete reference for all configuration options.

## Client Configuration

### Constructor Options

```javascript
const connector = new SSEConnector(url, options);
```

### Retry Policy

Controls reconnection behavior.

```javascript
{
  retryPolicy: {
    baseDelayMs: 1000,      // Initial delay between retries
    maxDelayMs: 30000,      // Maximum delay (cap for exponential backoff)
    maxAttempts: Infinity,  // Max attempts before giving up
    maxRetryTimeMs: Infinity, // Max total time retrying
    jitterPct: 0.2,         // Random jitter (0-1)
  }
}
```

**Calculation**: `delay = min(baseDelay * 2^attempt, maxDelay) * (1 ± jitter)`

### Pre-built Retry Policies

```javascript
import { RetryPolicies } from 'sse-streaming-reliability-kit/client';

// Aggressive: Fast retries, many attempts
RetryPolicies.AGGRESSIVE = {
  baseDelayMs: 500,
  maxDelayMs: 5000,
  maxAttempts: 20,
  jitterPct: 0.1,
};

// Standard: Balanced approach (default)
RetryPolicies.STANDARD = {
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  maxAttempts: Infinity,
  jitterPct: 0.2,
};

// Conservative: Slow retries, fewer attempts
RetryPolicies.CONSERVATIVE = {
  baseDelayMs: 2000,
  maxDelayMs: 60000,
  maxAttempts: 5,
  jitterPct: 0.3,
};
```

### Resume Options

```javascript
{
  // Persist Last-Event-ID across process restarts
  persistLastEventId: true,

  // Storage adapter (default: MemoryStorage)
  eventIdStorage: new FileStorage('./last-event-id.txt'),

  // What to do when server can't resume
  cannotResumeFallback: 'start_fresh', // 'start_fresh' | 'close' | 'callback'
}
```

### Liveness Options

```javascript
{
  // Enable heartbeat-based liveness detection
  enableLivenessCheck: true,

  // Time without heartbeat before triggering failure
  livenessTimeoutMs: 30000,

  // Grace period after connect before checking
  livenessGracePeriodMs: 5000,
}
```

### Deduplication Options

```javascript
{
  // Enable duplicate detection
  enableDedupe: true,

  // Max event IDs to track
  dedupeMaxSize: 1000,

  // TTL for cached IDs (0 = no expiry)
  dedupeTtlMs: 0,
}
```

### Ordering Options

```javascript
{
  // Enable ordering enforcement
  enableOrdering: true,

  // Ordering rule
  orderingRule: OrderingRule.SEQUENCE,

  // Policy for out-of-order events
  outOfOrderPolicy: OutOfOrderPolicy.DROP_WITH_CALLBACK,
}
```

**Ordering Rules:**

- `SEQUENCE`: Order by `sequence` field (monotonically increasing)
- `EVENT_ID`: Order by `event_id` (UUIDv7 is time-sortable)
- `TIMESTAMP`: Order by `ts` field
- `NONE`: No ordering enforcement

**Out-of-Order Policies:**

- `DROP`: Silently drop out-of-order events
- `DROP_WITH_CALLBACK`: Drop and call `onOutOfOrder`
- `ACCEPT`: Accept anyway (log only)

### Metrics Options

```javascript
{
  // Enable metrics collection
  enableMetrics: true,

  // Metrics sink (where to send metrics)
  metricsSink: createInMemorySink(),

  // Track event delivery lag
  trackEventLag: true,
}
```

### Callbacks

```javascript
{
  // Domain event received
  onEvent: (envelope) => {},

  // Connection opened
  onOpen: ({ url, lastEventId, reconnectCount, streamId }) => {},

  // Connection closed
  onClose: ({ reason, willReconnect, retryIn, attempt }) => {},

  // Error occurred
  onError: ({ type, message, source }) => {},

  // Retry scheduled
  onRetry: ({ attempt, delayMs, reason, elapsedMs }) => {},

  // Client gave up reconnecting
  onGiveUp: ({ reason, attempts, elapsedMs }) => {},

  // Heartbeat received
  onHeartbeat: (envelope) => {},

  // Control event received
  onControl: (envelope) => {},

  // Duplicate detected and dropped
  onDuplicate: ({ event_id, type }) => {},

  // Out-of-order event detected
  onOutOfOrder: ({ event_id, sequence, reason }) => {},

  // Liveness failure detected
  onLivenessFailure: ({ elapsedMs, timeoutMs }) => {},

  // Cannot resume from Last-Event-ID
  onCannotResume: ({ lastEventId, reason, payload }) => {},

  // Resume attempted
  onResumeAttempt: ({ lastEventId, attempt }) => {},

  // State changed
  onStateChange: ({ previous, current, reason }) => {},
}
```

---

## Server Configuration

### Environment Variables

```bash
# Server
PORT=3000
HOST=0.0.0.0

# SSE
SSE_TICK_INTERVAL=1000        # Event interval (ms)
SSE_HEARTBEAT_INTERVAL=15000  # Heartbeat interval (ms)
SSE_RETRY_TIMEOUT=3000        # Suggested retry (ms)

# Buffer
SSE_MAX_BUFFER_SIZE=1000      # Max events in buffer
SSE_MAX_REPLAY_BATCH=100      # Max events per replay
SSE_BUFFER_TTL_MS=0           # Buffer TTL (0 = forever)

# Connections
MAX_CONNECTIONS=1000          # Max concurrent connections

# Logging
LOG_LEVEL=info                # debug | info | warn | error
LOG_HEARTBEATS=false          # Log heartbeat events
LOG_REPLAY=false              # Log replay details

# Shutdown
SHUTDOWN_GRACE_PERIOD_MS=5000 # Grace period on shutdown
```

### Replay Buffer Options

```javascript
const buffer = createReplayBuffer({
  maxSize: 1000, // Max events to retain
  maxReplayBatch: 100, // Max events per replay response
  ttlMs: 300000, // Event TTL (5 minutes)
  debug: false, // Debug logging
});
```

### Connection Registry Options

```javascript
const registry = createRegistry({
  maxConnections: 1000,
  onConnectionChange: (event, connectionId, count) => {
    // event: 'register' | 'unregister'
  },
});
```
