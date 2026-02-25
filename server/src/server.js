/**
 * SSE Reference Server (US-14)
 * Implements server replay strategy for resume
 */
import Fastify from 'fastify';
import { config } from './config.js';
import { createSSEWriter } from './sse-writer.js';
import { createStreamManager } from './stream-manager.js';
import { getRegistry } from './connection-registry.js';
import { createReplayBuffer } from './replay-buffer.js';
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

// Global replay buffer (SSRK-135)
const replayBuffer = createReplayBuffer({
  maxSize: config.sse.maxBufferSize,
  maxReplayBatch: config.sse.maxReplayBatch,
  ttlMs: config.sse.bufferTtlMs,
  debug: config.log.replay,
});

// Server-wide metrics
const serverMetrics = {
  heartbeatsSent: 0,
  heartbeatsFailed: 0,
  lastHeartbeatTime: null,
  replaysAttempted: 0,
  replaysSucceeded: 0,
  replaysFailed: 0,
  replayEventsSent: 0,
  replaysTruncated: 0,
};

let isShuttingDown = false;

/**
 * Health check endpoint
 */
fastify.get('/health', async (request, reply) => {
  return {
    status: isShuttingDown ? 'shutting_down' : 'ok',
    timestamp: new Date().toISOString(),
    connections: registry.size,
    buffer: replayBuffer.getStats(),
    metrics: serverMetrics,
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
      maxReplayBatch: config.sse.maxReplayBatch,
      maxConnections: config.connections.maxConcurrent,
    },
    stats: {
      ...registry.getStats(),
      buffer: replayBuffer.getStats(),
      metrics: serverMetrics,
      isShuttingDown,
    },
  };
});

/**
 * SSE Stream endpoint
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

  // Read Last-Event-ID from request (SSRK-134)
  const lastEventId = request.headers['last-event-id'] || request.query.last_event_id || null;
  
  if (lastEventId) {
    fastify.log.info({ connectionId, lastEventId }, 'Resume requested with Last-Event-ID');
    
    if (config.log.replay) {
      console.log(`[REPLAY] [${connectionId}] Last-Event-ID: ${lastEventId}`);
    }
  }

  // Create SSE writer
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

  // Create stream manager with heartbeat
  const stream = createStreamManager(writer, {
    connectionId,
    tickInterval: config.sse.tickInterval,
    heartbeatInterval: config.sse.heartbeatInterval,
    debug: config.log.heartbeats,
    onHeartbeatError: (info) => {
      serverMetrics.heartbeatsFailed++;
      fastify.log.warn({ connectionId, ...info }, 'Heartbeat failed');
      cleanupConnection(DisconnectReason.NETWORK_ERROR);
    },
  });

  // Track events for replay and metrics
  const originalSendEvent = writer.sendEvent.bind(writer);
  writer.sendEvent = (envelope) => {
    const success = originalSendEvent(envelope);
    
    if (success) {
      // Add to replay buffer (skip heartbeats)
      if (envelope.type !== 'system.heartbeat') {
        replayBuffer.add(envelope);
      }
      
      registry.touch(connectionId);
      
      // Update heartbeat metrics
      if (envelope.type === 'system.heartbeat') {
        serverMetrics.heartbeatsSent++;
        serverMetrics.lastHeartbeatTime = Date.now();
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

  // Handle replay if Last-Event-ID provided (SSRK-136, SSRK-138)
  let replayPerformed = false;
  
  if (lastEventId) {
    serverMetrics.replaysAttempted++;
    
    const replayResult = replayBuffer.getEventsAfter(lastEventId);
    
    if (!replayResult.found) {
      // Event not in buffer - too old (SSRK-136)
      serverMetrics.replaysFailed++;
      
      if (config.log.replay) {
        console.log(`[REPLAY] [${connectionId}] Event not found: ${lastEventId} (reason: ${replayResult.reason})`);
      }
      
      // Send control.reconnect to inform client
      writer.sendControl('reconnect', {
        reason: 'events_expired',
        message: 'Requested events are no longer available in buffer',
        requestedId: lastEventId,
        oldestAvailable: replayBuffer.oldestEventId,
        newestAvailable: replayBuffer.newestEventId,
      });
    } else if (replayResult.events.length > 0) {
      // Replay events (SSRK-136, SSRK-137)
      serverMetrics.replaysSucceeded++;
      replayPerformed = true;
      
      if (replayResult.truncated) {
        serverMetrics.replaysTruncated++;
        
        if (config.log.replay) {
          console.log(`[REPLAY] [${connectionId}] Truncated: ${replayResult.totalAvailable} → ${replayResult.events.length}`);
        }
        
        // Inform client that replay was truncated (SSRK-138)
        writer.sendControl('replay_start', {
          reason: 'replay_truncated',
          message: 'Too many events to replay, sending partial batch',
          requestedId: lastEventId,
          totalAvailable: replayResult.totalAvailable,
          sending: replayResult.events.length,
          maxReplayBatch: config.sse.maxReplayBatch,
        });
      } else {
        writer.sendControl('replay_start', {
          reason: 'replay_started',
          requestedId: lastEventId,
          eventCount: replayResult.events.length,
        });
      }
      
      // Send replayed events in order (SSRK-137)
      for (const event of replayResult.events) {
        originalSendEvent(event); // Use original to avoid re-buffering
        serverMetrics.replayEventsSent++;
      }
      
      if (config.log.replay) {
        console.log(`[REPLAY] [${connectionId}] Sent ${replayResult.events.length} events`);
      }
      
      writer.sendControl('replay_end', {
        reason: 'replay_complete',
        eventCount: replayResult.events.length,
        truncated: replayResult.truncated,
      });
    } else {
      // No events to replay (client is caught up)
      serverMetrics.replaysSucceeded++;
      
      if (config.log.replay) {
        console.log(`[REPLAY] [${connectionId}] No events to replay (client is current)`);
      }
      
      writer.sendControl('replay_start', {
        reason: 'no_replay_needed',
        requestedId: lastEventId,
        eventCount: 0,
      });
    }
  }

  // Start live streaming
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
 * Debug endpoint - view buffer state
 */
fastify.get('/debug/buffer', async (request, reply) => {
  if (config.nodeEnv !== 'development' && config.nodeEnv !== 'test') {
    reply.code(404).send({ error: 'Not found' });
    return;
  }

  return {
    stats: replayBuffer.getStats(),
    oldestEventId: replayBuffer.oldestEventId,
    newestEventId: replayBuffer.newestEventId,
  };
});

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n[SHUTDOWN] Signal ${signal} received, starting graceful shutdown...`);
  console.log(`[SHUTDOWN] Active connections: ${registry.size}`);
  console.log(`[SHUTDOWN] Buffer size: ${replayBuffer.size}`);
  
  fastify.server.unref();
  
  const gracePeriod = config.shutdown.gracePeriodMs;
  console.log(`[SHUTDOWN] Waiting ${gracePeriod}ms for connections to close...`);
  
  await new Promise(resolve => setTimeout(resolve, gracePeriod));
  
  console.log(`[SHUTDOWN] Closing ${registry.size} remaining connections...`);
  registry.closeAll(DisconnectReason.SERVER_SHUTDOWN);
  
  await fastify.close();
  
  console.log('[SHUTDOWN] Server stopped');
  console.log(`[SHUTDOWN] Metrics:`, JSON.stringify(serverMetrics, null, 2));
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
║  Max Buffer Size:    ${String(config.sse.maxBufferSize).padEnd(6)}                          ║
║  Max Replay Batch:   ${String(config.sse.maxReplayBatch).padEnd(6)}                          ║
║  Max Connections:    ${String(config.connections.maxConcurrent).padEnd(6)}                          ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
