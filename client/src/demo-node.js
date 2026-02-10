// SSRK-49: Simple client test script to consume SSE (Node.js version)

import http from 'http';

const host = process.env.HOST || 'localhost';
const port = process.env.PORT || 3000;

console.log(`Connecting to SSE stream at http://${host}:${port}/stream...\n`);

const req = http.get(`http://${host}:${port}/stream`, (res) => {
  console.log('[CONNECTED] SSE connection established\n');

  res.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    lines.forEach((line) => {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        console.log('[EVENT]', data);
      } else if (line.startsWith(': heartbeat')) {
        console.log('[HEARTBEAT]');
      }
    });
  });

  res.on('end', () => {
    console.log('\n[DONE] Stream ended');
  });
});

req.on('error', (error) => {
  console.error('[ERROR]', error.message);
  process.exit(1);
});

// Close after 15 seconds
setTimeout(() => {
  console.log('\n[DONE] Closing connection after 15 seconds');
  req.destroy();
  process.exit(0);
}, 15000);
