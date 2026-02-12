/**
 * SSE Client Demo (SSRK-88)
 * Uses the SSEConnector module to verify server streaming
 */
import { connectSSE } from './sse-connector.js';

const host = process.env.HOST || 'localhost';
const port = process.env.PORT || 3000;
const duration = parseInt(process.env.DURATION, 10) || 15000;
const url = `http://${host}:${port}/stream`;

// Stats for verification
const stats = {
  eventsReceived: 0,
  ticksReceived: 0,
  heartbeatsReceived: 0,
  controlEvents: 0,
  errors: 0,
  startTime: Date.now(),
};

function log(tag, message, data = null) {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${ts}] [${tag.padEnd(10)}] ${message}${dataStr}`);
}

// Create connector with lifecycle callbacks (ST-02)
const connector = connectSSE(url, {
  // Lifecycle callbacks
  onOpen: ({ url, lastEventId }) => {
    log('OPEN', `Connected to ${url}`, lastEventId ? { resumeFrom: lastEventId } : null);
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

  onControl: (envelope) => {
    // Already handled in onEvent, but can add specific logic here
  },

  onSystemError: (envelope) => {
    stats.errors++;
    log('SYS_ERROR', `${envelope.payload.code}: ${envelope.payload.message}`);
  },

  onError: (error) => {
    stats.errors++;
    log('ERROR', `[${error.type}] ${error.message}`, error.source ? { source: error.source } : null);
  },

  onClose: ({ reason, willReconnect, retryIn }) => {
    log('CLOSE', `Connection closed: ${reason}`, willReconnect ? { retryIn } : { final: true });
  },

  // Options
  autoReconnect: true,
  maxRetries: 3,
});

log('CONNECT', `Connecting to ${url}...`);

// Auto-close after duration
setTimeout(() => {
  log('DONE', `Test duration (${duration}ms) reached`);
  connector.disconnect();
  printSummary();
  process.exit(stats.errors > 0 ? 1 : 0);
}, duration);

function printSummary() {
  const elapsed = Date.now() - stats.startTime;
  const connectorStats = connector.getStats();

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    VERIFICATION SUMMARY                    ║
╠═══════════════════════════════════════════════════════════╣
║  Duration:          ${String(elapsed + 'ms').padEnd(36)}║
║  State:             ${String(connector.getState()).padEnd(36)}║
║  Events Received:   ${String(stats.eventsReceived).padEnd(36)}║
║  Tick Events:       ${String(stats.ticksReceived).padEnd(36)}║
║  Heartbeats:        ${String(stats.heartbeatsReceived).padEnd(36)}║
║  Control Events:    ${String(stats.controlEvents).padEnd(36)}║
║  Errors:            ${String(stats.errors).padEnd(36)}║
║  Last Event ID:     ${String(connectorStats.lastEventId || 'N/A').slice(0, 34).padEnd(36)}║
║  Reconnect Count:   ${String(connectorStats.reconnectCount).padEnd(36)}║
╠═══════════════════════════════════════════════════════════╣
║  RESULT: ${stats.eventsReceived > 0 && stats.errors === 0 ? 'PASS ✓                                          ' : 'FAIL ✗                                          '}║
╚═══════════════════════════════════════════════════════════╝
  `);
}
