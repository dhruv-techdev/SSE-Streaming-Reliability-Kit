/**
 * SSE Client Demo (SSRK-88, SSRK-95)
 * Uses SSEConnector with state machine logging
 */
import { connectSSE, ConnectionState } from './sse-connector.js';

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
  stateChanges: [],
  startTime: Date.now(),
};

function log(tag, message, data = null) {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${ts}] [${tag.padEnd(10)}] ${message}${dataStr}`);
}

// Create connector with lifecycle callbacks
const connector = connectSSE(url, {
  // Debug mode (SSRK-95)
  debug,
  
  // State change callback (SSRK-92)
  onStateChange: ({ previous, current, reason }) => {
    stats.stateChanges.push({ from: previous, to: current, reason });
    log('STATE', `${previous} → ${current}`, { reason });
  },

  onOpen: ({ url, lastEventId, state }) => {
    log('OPEN', `Connected to ${url}`, { state, resumeFrom: lastEventId || 'none' });
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
    } else {
      log('EVENT', `${type}`, payload);
    }
  },

  onHeartbeat: (envelope) => {
    stats.heartbeatsReceived++;
    log('HEARTBEAT', `♥ Heartbeat #${stats.heartbeatsReceived}`);
  },

  onSystemError: (envelope) => {
    stats.errors++;
    log('SYS_ERROR', `${envelope.payload.code}: ${envelope.payload.message}`);
  },

  onError: (error) => {
    stats.errors++;
    log('ERROR', `[${error.type}] ${error.message}`, { source: error.source, state: error.state });
  },

  onClose: ({ reason, willReconnect, retryIn, state }) => {
    log('CLOSE', `Connection closed: ${reason}`, { willReconnect, retryIn, state });
  },

  autoReconnect: true,
  maxRetries: 3,
});

log('CONNECT', `Connecting to ${url}...`);

// Auto-close after duration
setTimeout(() => {
  log('DONE', `Test duration (${duration}ms) reached`);
  connector.stop();
  printSummary();
  process.exit(stats.errors > 0 ? 1 : 0);
}, duration);

function printSummary() {
  const elapsed = Date.now() - stats.startTime;
  const connectorStats = connector.getStats();
  const smStats = connectorStats.stateMachine;

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
║  State Changes:     ${String(stats.stateChanges.length).padEnd(36)}║
║  Transitions:       ${String(smStats.transitionCount).padEnd(36)}║
║  Last Event ID:     ${String(connectorStats.lastEventId || 'N/A').slice(0, 34).padEnd(36)}║
╠═══════════════════════════════════════════════════════════╣
║  STATE HISTORY:                                            ║`);
  
  stats.stateChanges.slice(-5).forEach(({ from, to, reason }) => {
    const line = `║    ${from} → ${to} (${reason})`;
    console.log(line.padEnd(60) + '║');
  });
  
  console.log(`╠═══════════════════════════════════════════════════════════╣
║  RESULT: ${stats.eventsReceived > 0 && stats.errors === 0 ? 'PASS ✓                                          ' : 'FAIL ✗                                          '}║
╚═══════════════════════════════════════════════════════════╝
  `);
}
