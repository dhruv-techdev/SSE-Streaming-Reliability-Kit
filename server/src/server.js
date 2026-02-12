/**
 * SSE Reference Server (US-05)
 * Implements all ST-01 through ST-07 requirements
 */
import Fastify from 'fastify';
import { config } from './config.js';
import { createSSEWriter } from './sse-writer.js';
import { createStreamManager } from './stream-manager.js';
import { Defaults } from '../../shared/src/index.js';

const fastify = Fastify({
  logger: config.nodeEnv === 'development',
});

// In-memory event buffer for replay (ST-04)
const eventBuffer = [];

function addToBuffer(event) {
  eventBuffer.push({ ...event, bufferedAt: Date.now() });
  if (eventBuffer.length > config.sse.maxBufferSize) {
    eventBuffer.shift();
  }
}

function getEventsAfter(lastEventId) {
  if (!lastEventId) return [];
  const index = eventBuffer.findIndex(e => e.event_id === lastEventId);
  if (index === -1) return null; // Gap - events expired
  return eventBuffer.slice(index + 1);
}

// Active connections tracking
const activeConnections = new Set();

/**
 * Health check endpoint
 */
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    connections: activeConnections.size,
    bufferedEvents: eventBuffer.length,
  };
});

/**
 * SSE Stream endpoint (ST-01)
 * GET /stream
 */
fastify.get('/stream', async (request, reply) => {
  const connectionId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  // Create SSE writer (ST-02)
  const writer = createSSEWriter(reply.raw, {
    onClose: (reason) => {
      activeConnections.delete(connectionId);
      fastify.log.info({ connectionId, reason }, 'Connection closed');
    },
  });

  // Initialize SSE headers (ST-01)
  writer.init();
  activeConnections.add(connectionId);

  // Handle Last-Event-ID for resume (ST-04)
  const lastEventId = request.headers['last-event-id'] || request.query.last_event_id;
  
  if (lastEventId) {
    fastify.log.info({ connectionId, lastEventId }, 'Resume requested');
    const missedEvents = getEventsAfter(lastEventId);
    
    if (missedEvents === null) {
      // Gap detected
      writer.sendControl('reconnect', {
        reason: 'events_expired',
        message: 'Requested events are no longer available',
      });
    } else if (missedEvents.length > 0) {
      // Replay missed events
      fastify.log.info({ connectionId, count: missedEvents.length }, 'Replaying events');
      for (const event of missedEvents) {
        writer.sendEvent(event);
      }
    }
  }

  // Create stream manager (ST-03, ST-05)
  const stream = createStreamManager(writer, {
    tickInterval: config.sse.tickInterval,
    heartbeatInterval: config.sse.heartbeatInterval,
  });

  // Intercept events to add to buffer
  const originalSendEvent = writer.sendEvent.bind(writer);
  writer.sendEvent = (envelope) => {
    addToBuffer(envelope);
    return originalSendEvent(envelope);
  };

  // Start streaming
  stream.start();

  // Handle client disconnect
  request.raw.on('close', () => {
    stream.stop();
    activeConnections.delete(connectionId);
  });

  // Don't end the response - keep it open for SSE
  reply.hijack();
});

/**
 * Server info endpoint
 */
fastify.get('/info', async (request, reply) => {
  return {
    name: 'SSE Streaming Reliability Kit',
    version: '1.0.0',
    config: {
      tickInterval: config.sse.tickInterval,
      heartbeatInterval: config.sse.heartbeatInterval,
      retryTimeout: config.sse.retryTimeout,
      maxBufferSize: config.sse.maxBufferSize,
    },
    stats: {
      activeConnections: activeConnections.size,
      bufferedEvents: eventBuffer.length,
    },
  };
});

/**
 * Graceful shutdown
 */
const shutdown = async (signal) => {
  fastify.log.info({ signal }, 'Shutdown signal received');
  
  // Notify all connected clients
  // Note: In production, you'd iterate and close each connection
  
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * Start server
 */
const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           SSE Streaming Reliability Kit v1.0.0            ║
╠═══════════════════════════════════════════════════════════╣
║  Server:     http://${config.host}:${config.port}                        ║
║  Health:     http://${config.host}:${config.port}/health                 ║
║  Info:       http://${config.host}:${config.port}/info                   ║
║  Stream:     http://${config.host}:${config.port}/stream                 ║
╠═══════════════════════════════════════════════════════════╣
║  Tick Interval:      ${String(config.sse.tickInterval).padEnd(6)}ms                        ║
║  Heartbeat Interval: ${String(config.sse.heartbeatInterval).padEnd(6)}ms                        ║
║  Retry Timeout:      ${String(config.sse.retryTimeout).padEnd(6)}ms                        ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
