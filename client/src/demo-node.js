/**
 * SSE Client Demo (ST-01 to ST-06 compliant)
 */
import http from 'http';
import { parseSSEChunk, decodeSSE, ClientState, Defaults } from '../../shared/src/index.js';

const host = process.env.HOST || 'localhost';
const port = process.env.PORT || 3000;

// Client state (ST-06)
let state = ClientState.CONNECTING;
let lastEventId = null;
let retryCount = 0;
let retryInterval = Defaults.RETRY_INTERVAL_MS;
let timeoutTimer = null;

function log(tag, message, data = '') {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${tag}] ${message}`, data);
}

function setState(newState) {
  log('STATE', `${state} → ${newState}`);
  state = newState;
}

function resetTimeout() {
  if (timeoutTimer) clearTimeout(timeoutTimer);
  timeoutTimer = setTimeout(() => {
    log('TIMEOUT', `No event received in ${Defaults.CLIENT_TIMEOUT_MS}ms`);
    reconnect('client_timeout');
  }, Defaults.CLIENT_TIMEOUT_MS);
}

function connect() {
  setState(ClientState.CONNECTING);
  
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

  // Add Last-Event-ID for resume (ST-04)
  if (lastEventId) {
    options.headers['Last-Event-ID'] = lastEventId;
    log('RESUME', `Resuming from ${lastEventId}`);
  }

  log('CONNECT', `Connecting to http://${host}:${port}/stream...`);

  const req = http.get(options, (res) => {
    if (res.statusCode !== 200) {
      log('ERROR', `HTTP ${res.statusCode}`);
      reconnect('server_error');
      return;
    }

    setState(ClientState.OPEN);
    retryCount = 0;
    resetTimeout();

    res.on('data', (chunk) => {
      resetTimeout(); // ST-03: Reset timeout on any data
      
      const raw = chunk.toString();
      const parsed = parseSSEChunk(raw);
      
      if (parsed.id) {
        lastEventId = parsed.id; // ST-04: Track last ID
      }
      
      if (parsed.retry) {
        retryInterval = parsed.retry; // Update retry interval
      }
      
      if (parsed.data) {
        const { envelope, error } = decodeSSE(parsed.data);
        if (error) {
          log('PARSE_ERROR', error);
        } else {
          handleEvent(envelope);
        }
      }
    });

    res.on('end', () => {
      log('END', 'Stream ended');
      reconnect('stream_ended');
    });
  });

  req.on('error', (error) => {
    log('ERROR', error.message);
    reconnect('network_error');
  });

  // Auto-close after 30 seconds for demo
  setTimeout(() => {
    log('DEMO', 'Closing connection after 30 seconds');
    req.destroy();
    setState(ClientState.CLOSED);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    process.exit(0);
  }, 30000);
}

function handleEvent(envelope) {
  const { type, payload, event_id, sequence } = envelope;
  
  switch (type) {
    case 'control.open':
      log('CONTROL', 'Connection opened', payload);
      break;
    case 'control.reconnect':
      log('CONTROL', 'Reconnect requested', payload);
      break;
    case 'system.heartbeat':
      log('HEARTBEAT', `♥ ${event_id}`);
      break;
    case 'system.error':
      log('ERROR', `${payload.code}: ${payload.message}`);
      break;
    default:
      log('EVENT', `[${type}] seq=${sequence || 'N/A'}`, payload);
  }
}

function reconnect(reason) {
  if (state === ClientState.CLOSED) return;
  if (timeoutTimer) clearTimeout(timeoutTimer);
  
  retryCount++;
  if (retryCount > Defaults.MAX_RETRY_ATTEMPTS) {
    log('FATAL', `Max retries (${Defaults.MAX_RETRY_ATTEMPTS}) exceeded`);
    setState(ClientState.CLOSED);
    process.exit(1);
  }

  setState(ClientState.RETRYING);
  log('RETRY', `Reason: ${reason}, attempt ${retryCount}/${Defaults.MAX_RETRY_ATTEMPTS}, waiting ${retryInterval}ms`);
  
  setTimeout(connect, retryInterval);
}

// Start
connect();
