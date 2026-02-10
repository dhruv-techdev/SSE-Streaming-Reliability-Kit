import Fastify from 'fastify';
import { config } from './config.js';
import {
  createEnvelope,
  createHeartbeat,
  createControl,
  createDomainEvent,
  encodeSSE,
  SSEHeaders,
  Defaults,
} from '../../shared/src/index.js';

const fastify = Fastify({
  logger: config.nodeEnv === 'development',
});

// In-memory event buffer for replay (ST-04)
const eventBuffer = [];
const MAX_BUFFER_SIZE = Defaults.MAX_REPLAY_EVENTS;

function addToBuffer(event) {
  eventBuffer.push(event);
  if (eventBuffer.length > MAX_BUFFER_SIZE) {
    eventBuffer.shift();
  }
}

function getEventsAfter(lastEventId) {
  if (!lastEventId) return [];
  const index = eventBuffer.findIndex(e => e.event_id === lastEventId);
  if (index === -1) return null; // Gap detected
  return eventBuffer.slice(index + 1);
}

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// SSE stream endpoint (ST-01 compliant)
fastify.get('/stream', async (request, reply) => {
  // Set required SSE headers (ST-01)
  reply.raw.writeHead(200, SSEHeaders);

  const lastEventId = request.headers['last-event-id'] || request.query.last_event_id;
  
  // Handle resume (ST-04)
  if (lastEventId) {
    const missedEvents = getEventsAfter(lastEventId);
    
    if (missedEvents === null) {
      // Gap detected - send control.reconnect
      const gapEvent = createControl('reconnect', {
        reason: 'events_expired',
        message: 'Requested events no longer available',
      });
      addToBuffer(gapEvent);
      reply.raw.write(encodeSSE(gapEvent));
    } else {
      // Replay missed events
      for (const event of missedEvents) {
        reply.raw.write(encodeSSE(event));
      }
    }
  }

  // Send control.open event
  const openEvent = createControl('open', {
    server_version: '1.0.0',
    heartbeat_interval: config.sse.heartbeatInterval,
  }, { retry: config.sse.retryTimeout });
  addToBuffer(openEvent);
  reply.raw.write(encodeSSE(openEvent));

  // Heartbeat interval (ST-03)
  let lastActivity = Date.now();
  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    if (now - lastActivity >= config.sse.heartbeatInterval) {
      const heartbeat = createHeartbeat();
      addToBuffer(heartbeat);
      reply.raw.write(encodeSSE(heartbeat));
      lastActivity = now;
    }
  }, config.sse.heartbeatInterval);

  // Demo: send some domain events
  let sequence = 0;
  const demoInterval = setInterval(() => {
    sequence++;
    const event = createDomainEvent('demo', 'tick', {
      count: sequence,
      message: `Demo event #${sequence}`,
    }, {
      stream_id: 'demo-stream',
      sequence,
    });
    addToBuffer(event);
    reply.raw.write(encodeSSE(event));
    lastActivity = Date.now();

    if (sequence >= 5) {
      clearInterval(demoInterval);
    }
  }, 2000);

  // Cleanup on close
  request.raw.on('close', () => {
    clearInterval(heartbeatInterval);
    clearInterval(demoInterval);
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
