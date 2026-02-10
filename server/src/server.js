import Fastify from 'fastify';
import { config } from './config.js';

const fastify = Fastify({
  logger: config.nodeEnv === 'development',
});

// SSRK-47: Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// SSRK-48: Minimal SSE "hello stream" endpoint
fastify.get('/stream', async (request, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send initial event
  reply.raw.write(`data: {"message": "hello stream", "timestamp": "${new Date().toISOString()}"}\n\n`);

  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    reply.raw.write(`: heartbeat\n\n`);
  }, config.sse.heartbeatInterval);

  // Send a few demo events
  let count = 0;
  const eventInterval = setInterval(() => {
    count++;
    reply.raw.write(`data: {"event": ${count}, "timestamp": "${new Date().toISOString()}"}\n\n`);
    
    if (count >= 5) {
      clearInterval(eventInterval);
    }
  }, 2000);

  // Cleanup on close
  request.raw.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(eventInterval);
  });
});

const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Server running at http://${config.host}:${config.port}`);
    console.log(`Health check: http://${config.host}:${config.port}/health`);
    console.log(`SSE stream: http://${config.host}:${config.port}/stream`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
