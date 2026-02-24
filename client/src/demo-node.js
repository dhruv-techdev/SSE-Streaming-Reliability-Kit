/**
 * SSE Client Demo (US-10)
 * Demonstrates retry limits and give-up behavior
 */
import { connectSSE, ConnectionState, RetryPolicies } from './sse-connector.js';

const host = process.env.HOST || 'localhost';
const port = process.env.PORT || 3000;
const duration = parseInt(process.env.DURATION, 10) || 15000;
const debug = process.env.DEBUG === 'true';
const url = `http://${host}:${port}/stream`;

// Stats for verification
const stats = {
  eventsReceived: 0,
  ticksReceived: 0,
  heartbeatsReceived: 0,
  controlEvents: 0,
  errors: 0,
  retries: [],
  stateChanges: [],
  gaveUp: false,
  giveUpInfo: null,
  startTime: Date.now(),
};

function log(tag, message, data = null) {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${ts}] [${tag.padEnd(10)}] ${message}${dataStr}`);
}

// Create connector with retry limits (US-10)
const connector = connectSSE(url, {
  debug,
  
  // Retry policy with limits (SSRK-106, SSRK-107)
  retryPolicy: {
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    maxAttempts: 5,           // Stop after 5 attempts (SSRK-106)
    maxRetryTimeMs: 60000,    // Or after 60 seconds total (SSRK-107)
    jitterPct: 0.2,
  },
  
  onStateChange: ({ previous, current, reason }) => {
    stats.stateChanges.push({ from: previous, to: current, reason });
    log('STATE', `${previous} → ${current}`, { reason });
  },

  onRetry: ({ attempt, delayMs, reason, elapsedMs, maxAttempts }) => {
    stats.retries.push({ attempt, delayMs, reason, elapsedMs });
    log('RETRY', `Attempt ${attempt}/${maxAttempts} in ${delayMs}ms`, { reason, elapsedMs });
  },

  // Give up callback (SSRK-109)
  onGiveUp: ({ reason, attempts, elapsedMs, lastError }) => {
    stats.gaveUp = true;
    stats.giveUpInfo = { reason, attempts, elapsedMs, lastError };
    log('GIVE_UP', `Stopped retrying: ${reason}`, { attempts, elapsedMs });
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

  onHeartbeat: () => {
    stats.heartbeatsReceived++;
    log('HEARTBEAT', `♥ Heartbeat #${stats.heartbeatsReceived}`);
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
log('POLICY', 'Retry policy configured', connector.getRetryPolicy().getConfig());

// Auto-close after duration
setTimeout(() => {
  log('DONE', `Test duration (${duration}ms) reached`);
  connector.stop();
  printSummary();
  process.exit(stats.errors > 0 && stats.eventsReceived === 0 ? 1 : 0);
}, duration);

function printSummary() {
  const elapsed = Date.now() - stats.startTime;
  const connectorStats = connector.getStats();
  const policy = connector.getRetryPolicy().getConfig();

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
║  Retry Attempts:    ${String(stats.retries.length).padEnd(36)}║
║  Gave Up:           ${String(stats.gaveUp ? 'YES' : 'NO').padEnd(36)}║
╠═══════════════════════════════════════════════════════════╣
║  RETRY LIMITS:                                             ║
║    Max Attempts:    ${String(policy.maxAttempts || 'unlimited').padEnd(36)}║
║    Max Time:        ${String(policy.maxRetryTimeMs ? policy.maxRetryTimeMs + 'ms' : 'unlimited').padEnd(36)}║
║    Base Delay:      ${String(policy.baseDelayMs + 'ms').padEnd(36)}║
║    Max Delay:       ${String(policy.maxDelayMs + 'ms').padEnd(36)}║`);

  if (stats.gaveUp && stats.giveUpInfo) {
    console.log(`╠═══════════════════════════════════════════════════════════╣
║  GIVE UP INFO:                                             ║
║    Reason:          ${String(stats.giveUpInfo.reason).padEnd(36)}║
║    Total Attempts:  ${String(stats.giveUpInfo.attempts).padEnd(36)}║
║    Elapsed Time:    ${String(stats.giveUpInfo.elapsedMs + 'ms').padEnd(36)}║`);
  }

  console.log(`╠═══════════════════════════════════════════════════════════╣
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
