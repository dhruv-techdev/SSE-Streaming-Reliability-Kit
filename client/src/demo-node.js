/**
 * SSE Client Demo / Verification Script (SSRK-74)
 * Verifies server streaming works correctly
 */
import http from 'http';
import { parseSSEChunk, decodeSSE, ClientState, Defaults } from '../../shared/src/index.js';

const host = process.env.HOST || 'localhost';
const port = process.env.PORT || 3000;
const duration = parseInt(process.env.DURATION, 10) || 15000;

// Verification counters
const stats = {
  connected: false,
  eventsReceived: 0,
  ticksReceived: 0,
  heartbeatsReceived: 0,
  controlEvents: 0,
  errors: 0,
  lastEventId: null,
  startTime: null,
  endTime: null,
};

function log(tag, message, data = '') {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${ts}] [${tag.padEnd(10)}] ${message}${dataStr}`);
}

function connect() {
  stats.startTime = Date.now();
  
  const options = {
    hostname: host,
    port: port,
    path: '/stream',
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  };

  log('CONNECT', `Connecting to http://${host}:${port}/stream...`);

  const req = http.get(options, (res) => {
    if (res.statusCode !== 200) {
      log('ERROR', `HTTP ${res.statusCode}`);
      process.exit(1);
    }

    // Verify headers (ST-01)
    const contentType = res.headers['content-type'];
    if (contentType !== 'text/event-stream') {
      log('FAIL', `Wrong Content-Type: ${contentType}`);
    } else {
      log('VERIFY', '✓ Content-Type: text/event-stream');
    }

    stats.connected = true;
    log('CONNECTED', 'SSE connection established');

    res.on('data', (chunk) => {
      const raw = chunk.toString();
      const lines = raw.split('\n\n').filter(Boolean);
      
      for (const block of lines) {
        const parsed = parseSSEChunk(block + '\n\n');
        
        if (parsed.id) {
          stats.lastEventId = parsed.id;
        }
        
        if (parsed.data) {
          const { envelope, error } = decodeSSE(parsed.data);
          if (error) {
            log('ERROR', error);
            stats.errors++;
          } else {
            handleEvent(envelope);
          }
        }
      }
    });

    res.on('end', () => {
      log('END', 'Stream ended');
      printSummary();
    });
  });

  req.on('error', (error) => {
    log('ERROR', error.message);
    stats.errors++;
  });

  // Auto-close after duration
  setTimeout(() => {
    log('CLOSING', `Test duration (${duration}ms) reached`);
    req.destroy();
    stats.endTime = Date.now();
    printSummary();
    process.exit(stats.errors > 0 ? 1 : 0);
  }, duration);
}

function handleEvent(envelope) {
  stats.eventsReceived++;
  const { type, payload, event_id, sequence } = envelope;

  // Verify envelope has required fields (ST-04)
  if (!event_id || !type || !envelope.ts || !payload) {
    log('FAIL', 'Missing required envelope fields', { event_id, type });
    stats.errors++;
    return;
  }

  switch (type) {
    case 'control.open':
      stats.controlEvents++;
      log('CONTROL', '✓ control.open received', payload);
      break;
      
    case 'control.close':
      stats.controlEvents++;
      log('CONTROL', 'control.close received', payload);
      break;
      
    case 'control.reconnect':
      stats.controlEvents++;
      log('CONTROL', 'control.reconnect received', payload);
      break;
      
    case 'system.heartbeat':
      stats.heartbeatsReceived++;
      log('HEARTBEAT', `♥ Heartbeat #${stats.heartbeatsReceived}`);
      break;
      
    case 'system.error':
      stats.errors++;
      log('ERROR', `${payload.code}: ${payload.message}`);
      break;
      
    default:
      if (type.startsWith('domain.')) {
        stats.ticksReceived++;
        log('EVENT', `✓ ${type} seq=${sequence || 'N/A'}`, payload);
      } else {
        log('EVENT', `Unknown type: ${type}`, payload);
      }
  }
}

function printSummary() {
  const elapsed = (stats.endTime || Date.now()) - stats.startTime;
  
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    VERIFICATION SUMMARY                    ║
╠═══════════════════════════════════════════════════════════╣
║  Duration:        ${String(elapsed + 'ms').padEnd(38)}║
║  Connected:       ${String(stats.connected ? 'YES ✓' : 'NO ✗').padEnd(38)}║
║  Events Received: ${String(stats.eventsReceived).padEnd(38)}║
║  Tick Events:     ${String(stats.ticksReceived).padEnd(38)}║
║  Heartbeats:      ${String(stats.heartbeatsReceived).padEnd(38)}║
║  Control Events:  ${String(stats.controlEvents).padEnd(38)}║
║  Errors:          ${String(stats.errors).padEnd(38)}║
║  Last Event ID:   ${String(stats.lastEventId || 'N/A').slice(0, 36).padEnd(38)}║
╠═══════════════════════════════════════════════════════════╣
║  RESULT: ${stats.connected && stats.ticksReceived > 0 && stats.errors === 0 ? 'PASS ✓                                          ' : 'FAIL ✗                                          '}║
╚═══════════════════════════════════════════════════════════╝
  `);
}

// Start verification
connect();
