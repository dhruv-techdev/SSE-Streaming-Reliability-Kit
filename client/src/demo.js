// SSRK-49: Simple client test script to consume SSE

const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';

console.log(`Connecting to SSE stream at ${serverUrl}/stream...\n`);

const eventSource = new EventSource(`${serverUrl}/stream`);

eventSource.onopen = () => {
  console.log('[CONNECTED] SSE connection established\n');
};

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('[EVENT]', data);
};

eventSource.onerror = (error) => {
  console.error('[ERROR] SSE connection error:', error);
  eventSource.close();
  process.exit(1);
};

// Close after 15 seconds
setTimeout(() => {
  console.log('\n[DONE] Closing connection after 15 seconds');
  eventSource.close();
  process.exit(0);
}, 15000);
