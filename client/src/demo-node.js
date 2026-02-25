/**
 * SSE Client Demo (US-17)
 * Shows ordering enforcement
 */
import { connectSSE, ConnectionState, CannotResumeFallback, OrderingRule, OutOfOrderPolicy } from './sse-connector.js';

const host = process.env.HOST || 'localhost';
const port = process.env.PORT || 3000;
const duration = parseInt(process.env.DURATION, 10) || 15000;
const debug = process.env.DEBUG === 'true';
const url = `http://${host}:${port}/stream`;

const stats = {
  eventsReceived: 0,
  ticksReceived: 0,
  heartbeatsReceived: 0,
  controlEvents: 0,
  errors: 0,
  livenessFailures: 0,
  resumeAttempts: 0,
  cannotResumeCount: 0,
  duplicatesIgnored: 0,
  outOfOrderDropped: 0,
  retries: [],
  stateChanges: [],
  gaveUp: false,
  giveUpInfo: null,
  startTime: Date.now(),
};

function log(tag, message, data = null) {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${ts}] [${tag.padEnd(14)}] ${message}${dataStr}`);
}

const connector = connectSSE(url, {
  debug,
  
  retryPolicy: {
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    maxAttempts: 5,
    maxRetryTimeMs: 60000,
    jitterPct: 0.2,
  },
  
  // Liveness detection
  enableLivenessCheck: true,
  livenessTimeoutMs: 45000,
  livenessGracePeriodMs: 5000,
  
  // Last-Event-ID persistence
  persistLastEventId: false,
  streamId: 'demo-stream',
  
  // Cannot-resume fallback behavior
  cannotResumeFallback: CannotResumeFallback.START_FRESH,
  
  // Dedupe configuration
  enableDedupe: true,
  dedupeMaxSize: 1000,
  
  // Ordering configuration (SSRK-152)
  enableOrdering: true,
  orderingRule: OrderingRule.SEQUENCE,
  outOfOrderPolicy: OutOfOrderPolicy.DROP_WITH_CALLBACK,
  
  onStateChange: ({ previous, current, reason }) => {
    stats.stateChanges.push({ from: previous, to: current, reason });
    log('STATE', `${previous} → ${current}`, { reason });
  },

  onRetry: ({ attempt, delayMs, reason, elapsedMs, maxAttempts }) => {
    stats.retries.push({ attempt, delayMs, reason, elapsedMs });
    log('RETRY', `Attempt ${attempt}/${maxAttempts} in ${delayMs}ms`, { reason, elapsedMs });
  },

  onGiveUp: ({ reason, attempts, elapsedMs, lastError }) => {
    stats.gaveUp = true;
    stats.giveUpInfo = { reason, attempts, elapsedMs, lastError };
    log('GIVE_UP', `Stopped retrying: ${reason}`, { attempts, elapsedMs });
  },

  onLivenessFailure: ({ lastHeartbeatAt, elapsedMs, timeoutMs }) => {
    stats.livenessFailures++;
    log('LIVENESS', `❌ Heartbeat missed!`, { elapsedMs, timeoutMs });
  },

  onResumeAttempt: ({ lastEventId, attempt, reconnectCount }) => {
    stats.resumeAttempts++;
    log('RESUME', `��� Attempting resume`, {
      lastEventId: lastEventId.slice(0, 20) + '...',
    });
  },

  onCannotResume: ({ lastEventId, reason, serverSuggestedAction }) => {
    stats.cannotResumeCount++;
    log('CANNOT_RESUME', `⚠️ Cannot resume`, { reason });
  },

  onDuplicate: ({ event_id, type, totalDuplicates }) => {
    stats.duplicatesIgnored++;
    log('DUPLICATE', `��� Ignored duplicate`, { event_id: event_id.slice(0, 12) + '...' });
  },

  // Out-of-order callback (SSRK-154)
  onOutOfOrder: ({ event_id, type, sequence, reason, lastAcceptedSequence }) => {
    stats.outOfOrderDropped++;
    log('OUT_OF_ORDER', `⏭️ Dropped out-of-order`, {
      event_id: event_id.slice(0, 12) + '...',
      sequence,
      lastAccepted: lastAcceptedSequence,
      reason,
    });
  },

  onOpen: ({ url, lastEventId, state, reconnectCount }) => {
    log('OPEN', `Connected to ${url}`, { 
      state, 
      resumeFrom: lastEventId ? lastEventId.slice(0, 20) + '...' : 'none',
      reconnectCount,
    });
  },

  onEvent: (envelope) => {
    stats.eventsReceived++;
    const { type, payload, sequence, event_id } = envelope;

    if (type.startsWith('control.')) {
      stats.controlEvents++;
      log('CONTROL', `✓ ${type}`, payload);
    } else if (type.startsWith('domain.')) {
      stats.ticksReceived++;
      log('EVENT', `✓ ${type} seq=${sequence || 'N/A'}`, {
        id: event_id.slice(0, 12) + '...',
      });
    }
  },

  onHeartbeat: (envelope) => {
    stats.heartbeatsReceived++;
    log('HEARTBEAT', `♥ #${stats.heartbeatsReceived}`);
  },

  onError: (error) => {
    stats.errors++;
    log('ERROR', `[${error.type}] ${error.message}`, { source: error.source });
  },

  onClose: ({ reason, willReconnect, retryIn, state }) => {
    log('CLOSE', `Connection closed: ${reason}`, { willReconnect, retryIn, state });
  },

  autoReconnect: true,
});

log('CONNECT', `Connecting to ${url}...`);
log('CONFIG', 'Ordering enforcement enabled', {
  rule: OrderingRule.SEQUENCE,
  policy: OutOfOrderPolicy.DROP_WITH_CALLBACK,
});

setTimeout(() => {
  log('DONE', `Test duration (${duration}ms) reached`);
  connector.stop();
  printSummary();
  process.exit(stats.errors > 0 && stats.eventsReceived === 0 ? 1 : 0);
}, duration);

function printSummary() {
  const elapsed = Date.now() - stats.startTime;
  const connectorStats = connector.getStats();
  const orderingStats = connectorStats.ordering;

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    VERIFICATION SUMMARY                    ║
╠═══════════════════════════════════════════════════════════╣
║  Duration:          ${String(elapsed + 'ms').padEnd(36)}║
║  Final State:       ${String(connector.getState()).padEnd(36)}║
║  Events Received:   ${String(connectorStats.eventsReceived).padEnd(36)}║
║  Events Processed:  ${String(connectorStats.eventsProcessed).padEnd(36)}║
║  Tick Events:       ${String(stats.ticksReceived).padEnd(36)}║
║  Heartbeats:        ${String(stats.heartbeatsReceived).padEnd(36)}║
║  Control Events:    ${String(stats.controlEvents).padEnd(36)}║
║  Errors:            ${String(stats.errors).padEnd(36)}║
╠═══════════════════════════════════════════════════════════╣
║  ORDERING ENFORCEMENT:                                     ║
║    Rule:            ${String(orderingStats.orderingRule).padEnd(36)}║
║    Total Checked:   ${String(orderingStats.totalChecked).padEnd(36)}║
║    Total Accepted:  ${String(orderingStats.totalAccepted).padEnd(36)}║
║    Total Dropped:   ${String(orderingStats.totalDropped).padEnd(36)}║
║    Last Seq:        ${String(orderingStats.lastAcceptedSequence || 'N/A').padEnd(36)}║
╠═══════════════════════════════════════════════════════════╣
║  DEDUPE CACHE:                                             ║
║    Duplicates:      ${String(connectorStats.dedupe.totalDuplicates).padEnd(36)}║
║    Cache Size:      ${String(connectorStats.dedupe.size).padEnd(36)}║
╠═══════════════════════════════════════════════════════════╣
║  STATE HISTORY:                                            ║`);
  
  stats.stateChanges.slice(-5).forEach(({ from, to, reason }) => {
    const line = `║    ${from} → ${to} (${reason})`;
    console.log(line.padEnd(60) + '║');
  });
  
  console.log(`╠═══════════════════════════════════════════════════════════╣
║  RESULT: ${stats.eventsReceived > 0 ? 'PASS ✓                                          ' : 'FAIL ✗                                          '}║
╚═══════════════════════════════════════════════════════════╝
  `);
}
