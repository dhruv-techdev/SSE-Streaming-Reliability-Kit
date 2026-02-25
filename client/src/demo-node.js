/**
 * SSE Client Demo (US-13)
 * Shows Last-Event-ID resume
 */
import { connectSSE, ConnectionState } from './sse-connector.js';

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
  retries: [],
  stateChanges: [],
  gaveUp: false,
  giveUpInfo: null,
  startTime: Date.now(),
};

function log(tag, message, data = null) {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${ts}] [${tag.padEnd(12)}] ${message}${dataStr}`);
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
  
  // Last-Event-ID persistence (SSRK-129)
  persistLastEventId: false, // Use in-memory for demo
  streamId: 'demo-stream',
  
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
    log('LIVENESS', `❌ Heartbeat missed!`, { 
      elapsedMs,
      timeoutMs,
    });
  },

  // Resume attempt callback (SSRK-132)
  onResumeAttempt: ({ lastEventId, attempt, reconnectCount }) => {
    stats.resumeAttempts++;
    log('RESUME', `��� Attempting resume`, {
      lastEventId: lastEventId.slice(0, 20) + '...',
      attempt,
      reconnectCount,
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
log('CONFIG', 'Last-Event-ID resume enabled', {
  streamId: 'demo-stream',
  persistLastEventId: false,
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
  const livenessStats = connectorStats.liveness;

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    VERIFICATION SUMMARY                    ║
╠═══════════════════════════════════════════════════════════╣
║  Duration:          ${String(elapsed + 'ms').padEnd(36)}║
║  Final State:       ${String(connector.getState()).padEnd(36)}║
║  Events Received:   ${String(stats.eventsReceived).padEnd(36)}║
║  Tick Events:       ${String(stats.ticksReceived).padEnd(36)}║
║  Heartbeats:        ${String(stats.heartbeatsReceived).padEnd(36)}║
║  Control Events:    ${String(stats.controlEvents).padEnd(36)}║
║  Errors:            ${String(stats.errors).padEnd(36)}║
║  Reconnect Count:   ${String(connectorStats.reconnectCount).padEnd(36)}║
╠═══════════════════════════════════════════════════════════╣
║  LAST-EVENT-ID RESUME:                                     ║
║    Current ID:      ${String(connector.lastEventId ? connector.lastEventId.slice(0, 20) + '...' : 'none').padEnd(36)}║
║    Resume Attempts: ${String(connectorStats.resumeAttempts).padEnd(36)}║
║    Has Resume Pt:   ${String(connector.getEventIdStore().hasResumePoint()).padEnd(36)}║
╠═══════════════════════════════════════════════════════════╣
║  LIVENESS DETECTION:                                       ║
║    HB Received:     ${String(livenessStats.heartbeatsReceived).padEnd(36)}║
║    Failures:        ${String(livenessStats.failureCount).padEnd(36)}║
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
