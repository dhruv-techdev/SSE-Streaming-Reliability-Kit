/**
 * Resilient Client Example
 * Demonstrates all reliability features
 * Run: node examples/resilient-client.js
 */
import { connectSSE, MemoryStorage, createInMemorySink } from '../client/src/sse-connector.js';

// Create metrics sink
const metrics = createInMemorySink();

// Create client with all reliability features
const connector = connectSSE('http://localhost:3000/stream', {
  // Retry policy
  retryPolicy: {
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    maxAttempts: 10,
    jitterPct: 0.2,
  },

  // Resume support
  persistLastEventId: true,
  eventIdStorage: new MemoryStorage(),

  // Liveness detection
  enableLivenessCheck: true,
  livenessTimeoutMs: 5000,
  livenessGracePeriodMs: 2000,

  // Deduplication
  enableDedupe: true,
  dedupeMaxSize: 500,

  // Metrics
  enableMetrics: true,
  metricsSink: metrics,
  trackEventLag: true,

  // Callbacks
  onEvent: (event) => {
    console.log(`[EVENT] ${event.type} #${event.sequence}`);
  },

  onOpen: ({ reconnectCount, streamId }) => {
    console.log(`[OPEN] Connected (reconnect #${reconnectCount}, stream: ${streamId})`);
  },

  onClose: ({ reason, willReconnect, retryIn }) => {
    console.log(`[CLOSE] ${reason}, reconnect: ${willReconnect}`);
  },

  onRetry: ({ attempt, delayMs }) => {
    console.log(`[RETRY] Attempt ${attempt} in ${delayMs}ms`);
  },

  onGiveUp: ({ reason, attempts }) => {
    console.log(`[GIVE UP] ${reason} after ${attempts} attempts`);
  },

  onDuplicate: ({ event_id }) => {
    console.log(`[DUPLICATE] Dropped ${event_id}`);
  },

  onLivenessFailure: ({ elapsedMs }) => {
    console.log(`[LIVENESS] Failure after ${elapsedMs}ms`);
  },

  onCannotResume: ({ reason }) => {
    console.log(`[CANNOT RESUME] ${reason}`);
  },
});

// Print stats every 10 seconds
setInterval(() => {
  const stats = connector.getStats();
  console.log('\n--- Stats ---');
  console.log(`Events: ${stats.eventsReceived} received, ${stats.eventsProcessed} processed`);
  console.log(`Reconnects: ${stats.reconnectCount}`);
  console.log(`Duplicates ignored: ${stats.duplicatesIgnored}`);
  console.log(`Lag: avg=${stats.lag.avg}ms, p95=${stats.lag.p95}ms`);
  console.log('-------------\n');
}, 10000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nFinal stats:', connector.getStats());
  connector.stop();
  process.exit(0);
});

console.log('Resilient client started. Press Ctrl+C to exit.');
