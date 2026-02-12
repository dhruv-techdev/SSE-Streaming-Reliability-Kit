/**
 * SSE Reference Server (US-05, US-06)
 * Implements connection lifecycle handling
 */
import Fastify from 'fastify';
import { config } from './config.js';
import { createSSEWriter } from './sse-writer.js';
import { createStreamManager } from './stream-manager.js';
import { getRegistry } from './connection-registry.js';
import { Defaults, DisconnectReason } from '../../shared/src/index.js';

const fastify = Fastify({
  logger: config.nodeEnv === 'development',
});

// Initialize connection registry (ST-01)
const registry = getRegistry({
  maxConnections: config.connections.maxConcurrent,
  onConnectionChange: (event, id, count) => {
    fastify.log.info({ event, connectionId: id, activeConnections: count }, 'Connection change');
  },
});

// In-memory event buffer for replay
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
  if (index === -1) return null;
  return eventBuffer.slice(index + 1);
}

// Server state for graceful shutdown (ST-05)
let isShuttingDown = false;

/**
 * Health check endpoint
 */
fastify.get('/health', async (request, reply) => {
  return {
    status: isShuttingDown ? 'shutting_down' : 'ok',
    timestamp: new Date().toISOString(),
    connections: registry.size,
    bufferedEvents: eventBuffer.length,
  };
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
      maxConnections: config.connections.maxConcurrent,
    },
    stats: {
      ...registry.getStats(),
      bufferedEvents: eventBuffer.length,
      isShuttingDown,
    },
  };
});

/**
 * SSE Stream endpoint (ST-01)
 */
fastify.get('/stream', async (request, reply) => {
  // Reject new connections during shutdown (ST-05)
  if (isShuttingDown) {
    reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Server is shutting down',
      code: DisconnectReason.SERVER_SHUTDOWN,
    });
    return;
  }

  const connectionId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Try to register connection (ST-01, ST-06)
  const registration = registry.register(connectionId, {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  });

  if (!registration.success) {
    // Max connections exceeded (ST-06)
    reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Too many connections',
      code: registration.reason,
      retry: config.sse.retryTimeout,
    });
    return;
  }

  // Create SSE writer with error handling (ST-04)
  const writer = createSSEWriter(reply.raw, {
    connectionId,
    onClose: (reason) => {
      fastify.log.info({ connectionId, reason }, 'Writer closed');
    },
    onError: (err, operation) => {
      fastify.log.error({ connectionId, operation, error: err.message }, 'Writer error');
      cleanupConnection(DisconnectReason.NETWORK_ERROR);
    },
  });

  // Initialize SSE headers
  writer.init();

  // Create stream manager
  const stream = createStreamManager(writer, {
    tickInterval: config.sse.tickInterval,
    heartbeatInterval: config.sse.heartbeatInterval,
  });

  // Cleanup function (ST-03)
  const cleanupConnection = (reason) => {
    if (!registry.has(connectionId)) return; // Already cleaned up
    
    stream.stop();
    writer.close(reason);
    registry.unregister(connectionId, reason);
  };

  // Register cleanup function (ST-03)
  registry.setCleanup(connectionId, cleanupConnection);

  // Register timers for cleanup tracking (ST-02)
  registry.addTimer(connectionId, stream.tickTimer);
  registry.addTimer(connectionId, stream.heartbeatTimer);

  // Handle Last-Event-ID for resume
  const lastEventId = request.headers['last-event-id'] || request.query.last_event_id;
  
  if (lastEventId) {
    const missedEvents = getEventsAfter(lastEventId);
    
    if (missedEvents === null) {
      writer.sendControl('reconnect', {
        reason: 'events_expired',
        message: 'Requested events are no longer available',
      });
    } else if (missedEvents.length > 0) {
      for (const event of missedEvents) {
        writer.sendEvent(event);
      }
    }
  }

  // Intercept events to add to buffer
  const originalSendEvent = writer.sendEvent.bind(writer);
  writer.sendEvent = (envelope) => {
    addToBuffer(envelope);
    registry.touch(connectionId);
    return originalSendEvent(envelope);
  };

  // Start streaming
  stream.start();

  // Handle client disconnect (ST-02)
  request.raw.on('close', () => {
    cleanupConnection(DisconnectReason.CLIENT_CLOSE);
  });

  request.raw.on('error', (err) => {
    fastify.log.error({ connectionId, error: err.message }, 'Request error');
    cleanupConnection(DisconnectReason.NETWORK_ERROR);
  });

  // Handle aborted request
  request.raw.on('aborted', () => {
    cleanupConnection(DisconnectReason.CLIENT_ABORT);
  });

  // Hijack response to keep connection open
  reply.hijack();
});

/**
 * Graceful shutdown handler (ST-05)
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n[SHUTDOWN] Signal ${signal} received, starting graceful shutdown...`);
  console.log(`[SHUTDOWN] Active connections: ${registry.size}`);
  
  // Stop accepting new connections
  fastify.server.unref();
  
  // Give existing connections time to finish
  const gracePeriod = config.shutdown.gracePeriodMs;
  console.log(`[SHUTDOWN] Waiting ${gracePeriod}ms for connections to close...`);
  
  await new Promise(resolve => setTimeout(resolve, gracePeriod));
  
  // Force close remaining connections
  console.log(`[SHUTDOWN] Closing ${registry.size} remaining connections...`);
  registry.closeAll(DisconnectReason.SERVER_SHUTDOWN);
  
  // Close server
  await fastify.close();
  
  console.log('[SHUTDOWN] Server stopped');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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
║  Max Connections:    ${String(config.connections.maxConcurrent).padEnd(6)}                          ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
