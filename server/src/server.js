/**
 * SSE Reference Server (US-11)
 * Implements heartbeat/keepalive events
 */
import Fastify from 'fastify';
import { config } from './config.js';
import { createSSEWriter } from './sse-writer.js';
import { createStreamManager } from './stream-manager.js';
import { getRegistry } from './connection-registry.js';
import { Defaults, DisconnectReason, SSEHeaders } from '../../shared/src/index.js';

const fastify = Fastify({
  logger: config.nodeEnv === 'development',
});

// Initialize connection registry
const registry = getRegistry({
  maxConnections: config.connections.maxConcurrent,
  onConnectionChange: (event, id, count) => {
    fastify.log.info({ event, connectionId: id, activeConnections: count }, 'Connection change');
  },
});

// In-memory event buffer for replay
const eventBuffer = [];

// Server-wide heartbeat metrics (SSRK-118)
const heartbeatMetrics = {
  totalSent: 0,
  totalFailed: 0,
  lastHeartbeatTime: null,
};

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
    heartbeatMetrics, // SSRK-118
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
      heartbeatMetrics,
      isShuttingDown,
    },
  };
});

/**
 * SSE Stream endpoint (SSRK-117: correct headers)
 */
fastify.get('/stream', async (request, reply) => {
  if (isShuttingDown) {
    reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Server is shutting down',
      code: DisconnectReason.SERVER_SHUTDOWN,
    });
    return;
  }

  const connectionId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const registration = registry.register(connectionId, {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  });

  if (!registration.success) {
    reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Too many connections',
      code: registration.reason,
      retry: config.sse.retryTimeout,
    });
    return;
  }

  // Create SSE writer with correct headers (SSRK-117)
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

  writer.init();

  // Create stream manager with heartbeat (SSRK-115)
  const stream = createStreamManager(writer, {
    connectionId,
    tickInterval: config.sse.tickInterval,
    heartbeatInterval: config.sse.heartbeatInterval,
    debug: config.log.heartbeats,
    onHeartbeatError: (info) => {
      // Heartbeat write failed (SSRK-116)
      heartbeatMetrics.totalFailed++;
      fastify.log.warn({ connectionId, ...info }, 'Heartbeat failed');
      cleanupConnection(DisconnectReason.NETWORK_ERROR);
    },
  });

  // Track heartbeats (SSRK-118)
  const originalSendEvent = writer.sendEvent.bind(writer);
  writer.sendEvent = (envelope) => {
    const success = originalSendEvent(envelope);
    
    if (success) {
      addToBuffer(envelope);
      registry.touch(connectionId);
      
      // Update heartbeat metrics (SSRK-118)
      if (envelope.type === 'system.heartbeat') {
        heartbeatMetrics.totalSent++;
        heartbeatMetrics.lastHeartbeatTime = Date.now();
        
        if (config.log.heartbeats) {
          fastify.log.debug({ connectionId, type: envelope.type }, 'Heartbeat sent');
        }
      }
    }
    
    return success;
  };

  const cleanupConnection = (reason) => {
    if (!registry.has(connectionId)) return;
    
    stream.stop();
    writer.close(reason);
    registry.unregister(connectionId, reason);
  };

  registry.setCleanup(connectionId, cleanupConnection);

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
        originalSendEvent(event);
      }
    }
  }

  // Start streaming (includes heartbeat scheduler)
  stream.start();

  // Handle client disconnect
  request.raw.on('close', () => {
    cleanupConnection(DisconnectReason.CLIENT_CLOSE);
  });

  request.raw.on('error', (err) => {
    fastify.log.error({ connectionId, error: err.message }, 'Request error');
    cleanupConnection(DisconnectReason.NETWORK_ERROR);
  });

  request.raw.on('aborted', () => {
    cleanupConnection(DisconnectReason.CLIENT_ABORT);
  });

  reply.hijack();
});

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n[SHUTDOWN] Signal ${signal} received, starting graceful shutdown...`);
  console.log(`[SHUTDOWN] Active connections: ${registry.size}`);
  
  fastify.server.unref();
  
  const gracePeriod = config.shutdown.gracePeriodMs;
  console.log(`[SHUTDOWN] Waiting ${gracePeriod}ms for connections to close...`);
  
  await new Promise(resolve => setTimeout(resolve, gracePeriod));
  
  console.log(`[SHUTDOWN] Closing ${registry.size} remaining connections...`);
  registry.closeAll(DisconnectReason.SERVER_SHUTDOWN);
  
  await fastify.close();
  
  console.log('[SHUTDOWN] Server stopped');
  console.log(`[SHUTDOWN] Heartbeat stats: sent=${heartbeatMetrics.totalSent}, failed=${heartbeatMetrics.totalFailed}`);
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
