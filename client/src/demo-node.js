/**
 * SSE Client Demo (US-12)
 * Shows liveness detection
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
  
  // Liveness detection (SSRK-121)
  enableLivenessCheck: true,
  livenessTimeoutMs: 45000, // 45 seconds
  livenessGracePeriodMs: 5000, // 5 second grace period
  
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

  // Liveness failure callback (SSRK-125)
  onLivenessFailure: ({ lastHeartbeatAt, elapsedMs, timeoutMs }) => {
    stats.livenessFailures++;
    log('LIVENESS', `❌ Heartbeat missed!`, { 
      elapsedMs,
      timeoutMs,
      lastHeartbeatAt: lastHeartbeatAt ? new Date(lastHeartbeatAt).toISOString() : 'never',
    });
  },

  onOpen: ({ url, lastEventId, state, reconnectCount }) => {
    log('OPEN', `Connected to ${url}`, { 
      state, 
      resumeFrom: lastEventId || 'none',
      reconnectCount,
    });
  },

  onEvent: (envelope) => {
    stats.eventsReceived++;
    const { type, payload, sequence } = envelope;

    if (type.startsWith('control.')) {
      stats.controlEvents++;
      log('CONTROL', `✓ ${type}`, payload);
    } else if (type.startsWith('domain.')) {
      stats.ticksReceived++;
      log('EVENT', `✓ ${type} seq=${sequence || 'N/A'}`, payload);
    }
  },

  onHeartbeat: (envelope) => {
    stats.heartbeatsReceived++;
    const { payload } = envelope;
    log('HEARTBEAT', `♥ #${stats.heartbeatsReceived}`, {
      server_time: payload.server_time,
      interval_ms: payload.interval_ms,
    });
  },

  onError: (error) => {
    stats.errors++;
    log('ERROR', `[${error.type}] ${error.message}`, { source: error.source });
  },

  onClose: ({ reason, willReconnect, retryIn, attempt, elapsedMs, state }) => {
    log('CLOSE', `Connection closed: ${reason}`, { 
      willReconnect, 
      retryIn, 
      attempt,
      elapsedMs,
      state,
    });
  },

  autoReconnect: true,
});

log('CONNECT', `Connecting to ${url}...`);
log('CONFIG', 'Liveness detection enabled', {
  timeoutMs: connector.options.livenessTimeoutMs,
  gracePeriodMs: connector.options.livenessGracePeriodMs,
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
║  LIVENESS DETECTION:                                       ║
║    Timeout:         ${String(livenessStats.timeoutMs + 'ms').padEnd(36)}║
║    Grace Period:    ${String(livenessStats.gracePeriodMs + 'ms').padEnd(36)}║
║    HB Received:     ${String(livenessStats.heartbeatsReceived).padEnd(36)}║
║    Failures:        ${String(livenessStats.failureCount).padEnd(36)}║
║    Last HB:         ${String(livenessStats.timeSinceLastHeartbeat ? livenessStats.timeSinceLastHeartbeat + 'ms ago' : 'N/A').padEnd(36)}║
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
