/**
 * SSE Client Demo (US-16)
 * Shows dedupe functionality
 */
import { connectSSE, ConnectionState, CannotResumeFallback } from './sse-connector.js';

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
  
  // Dedupe configuration (SSRK-149)
  enableDedupe: true,
  dedupeMaxSize: 1000,
  dedupeTtlMs: 0, // No TTL
  
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
      attempt,
      reconnectCount,
    });
  },

  onCannotResume: ({ lastEventId, reason, serverSuggestedAction }) => {
    stats.cannotResumeCount++;
    log('CANNOT_RESUME', `⚠️ Cannot resume from ${lastEventId}`, {
      reason,
      action: serverSuggestedAction,
    });
  },

  // Duplicate callback (SSRK-150)
  onDuplicate: ({ event_id, type, totalDuplicates }) => {
    stats.duplicatesIgnored++;
    log('DUPLICATE', `��� Ignored duplicate`, {
      event_id: event_id.slice(0, 12) + '...',
      type,
      total: totalDuplicates,
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
    const { payload } = envelope;
    log('HEARTBEAT', `♥ #${stats.heartbeatsReceived}`, {
      server_time: payload.server_time,
    });
  },

  onError: (error) => {
    stats.errors++;
    log('ERROR', `[${error.type}] ${error.message}`, { source: error.source });
  },

  onClose: ({ reason, willReconnect, retryIn, attempt, elapsedMs, state, lastEventId }) => {
    log('CLOSE', `Connection closed: ${reason}`, { 
      willReconnect, 
      retryIn, 
      attempt,
      elapsedMs,
      state,
      lastEventId: lastEventId ? lastEventId.slice(0, 12) + '...' : 'none',
    });
  },

  autoReconnect: true,
});

log('CONNECT', `Connecting to ${url}...`);
log('CONFIG', 'Dedupe enabled', {
  maxSize: 1000,
  ttlMs: 0,
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
  const dedupeStats = connectorStats.dedupe;

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
║  DEDUPE CACHE:                                             ║
║    Cache Size:      ${String(dedupeStats.size).padEnd(36)}║
║    Max Size:        ${String(dedupeStats.maxSize).padEnd(36)}║
║    Total Checked:   ${String(dedupeStats.totalChecked).padEnd(36)}║
║    Total Added:     ${String(dedupeStats.totalAdded).padEnd(36)}║
║    Duplicates:      ${String(dedupeStats.totalDuplicates).padEnd(36)}║
║    Evicted:         ${String(dedupeStats.totalEvicted).padEnd(36)}║
╠═══════════════════════════════════════════════════════════╣
║  RESUME & RECONNECT:                                       ║
║    Reconnect Count: ${String(connectorStats.reconnectCount).padEnd(36)}║
║    Resume Attempts: ${String(connectorStats.resumeAttempts).padEnd(36)}║
║    Cannot Resume:   ${String(connectorStats.cannotResumeCount).padEnd(36)}║
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
