/**
 * Basic Server Example
 * Run: node examples/basic-server.js
 */
import Fastify from 'fastify';
import { createSSEWriter, createEnvelope, generateEventId } from '../shared/src/index.js';

const app = Fastify();

app.get('/events', (request, reply) => {
  console.log('Client connected');

  const writer = createSSEWriter(reply.raw);
  writer.init();

  let sequence = 0;

  // Send events every second
  const interval = setInterval(() => {
    sequence++;
    const event = {
      event_id: generateEventId(),
      type: 'domain.tick',
      ts: new Date().toISOString(),
      sequence,
      payload: {
        message: `Event #${sequence}`,
        timestamp: Date.now(),
      },
    };

    writer.sendEvent(event);
    console.log(`Sent event #${sequence}`);
  }, 1000);

  // Cleanup on disconnect
  request.raw.on('close', () => {
    clearInterval(interval);
    console.log('Client disconnected');
  });

  reply.hijack();
});

app.get('/health', () => ({ status: 'ok' }));

app.listen({ port: 3001 }, (err) => {
  if (err) throw err;
  console.log('Basic server running at http://localhost:3001');
  console.log('Stream endpoint: http://localhost:3001/events');
});
