/**
 * Basic Client Example
 * Run: node examples/basic-client.js
 */
import { connectSSE } from '../client/src/sse-connector.js';

const connector = connectSSE('http://localhost:3001/events', {
  onEvent: (event) => {
    console.log(`[EVENT] ${event.type} #${event.sequence}:`, event.payload.message);
  },

  onOpen: ({ url, reconnectCount }) => {
    console.log(`[CONNECTED] to ${url} (reconnect #${reconnectCount})`);
  },

  onClose: ({ reason, willReconnect, retryIn }) => {
    console.log(`[DISCONNECTED] ${reason}`);
    if (willReconnect) {
      console.log(`  Reconnecting in ${retryIn}ms...`);
    }
  },

  onError: (err) => {
    console.error(`[ERROR]`, err.message);
  },
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  connector.stop();
  process.exit(0);
});

console.log('Client started. Press Ctrl+C to exit.');
