/**
 * SSE Reference Server (US-21)
 * Implements correlation IDs across events and logs
 */
import Fastify from 'fastify';
import { config } from './config.js';
import { createSSEWriter } from './sse-writer.js';
import { createStreamManager } from './stream-manager.js';
import { getRegistry } from './connection-registry.js';
import { createReplayBuffer } from './replay-buffer.js';
import { getMetrics } from './metrics.js';
import { getServerLogger } from './server-logger.js';
import {
  Defaults,
  DisconnectReason,
  CannotResumeReason,
  SSEHeaders,
  LogLevel,
  generateStreamId,
  extractTraceId,
  createCorrelationContext,
} from '../../shared/src/index.js';

const fastify = Fastify({
  logger: false,
});

// Initialize structured logger
const logger = getServerLogger({
  level: config.log.level,
  enabled: true,
});

// Initialize metrics registry
const metrics = getMetrics();

// Initialize connection registry
const registry = getRegistry({
  maxConnections: config.connections.maxConcurrent,
  onConnectionChange: (event, id, count) => {
    logger.debug('registry.change', `Connection ${event}: ${id}`, {
      connection_id: id,
      active_connections: count,
    });
  },
});

// Global replay buffer
const replayBuffer = createReplayBuffer({
  maxSize: config.sse.maxBufferSize,
  maxReplayBatch: config.sse.maxReplayBatch,
  ttlMs: config.sse.bufferTtlMs,
  debug: config.log.replay,
});

let isShuttingDown = false;

// Track active stream managers for debug pause/resume endpoints
const activeManagers = new Set();

/**
 * Health check endpoint
 */
fastify.get('/health', async (request, reply) => {
  return {
    status: isShuttingDown ? 'shutting_down' : 'ok',
    timestamp: new Date().toISOString(),
    connections: registry.size,
    buffer: replayBuffer.getStats(),
    metrics: metrics.toJSON(),
  };
});

/**
 * Prometheus metrics endpoint
 */
fastify.get('/metrics', async (request, reply) => {
  reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  return metrics.toPrometheus();
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
      metrics: metrics.toJSON(),
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

  // Generate stream_id for this connection (SSRK-184)
  const streamId = generateStreamId();

  // Extract trace_id from request if provided (SSRK-187)
  const traceId = extractTraceId(request);

  // Create correlation context
  const correlation = createCorrelationContext({
    streamId,
    traceId,
  });

  // Legacy connection ID (for backward compatibility)
  const connectionId = streamId;

  // Log stream connect attempt with correlation (SSRK-185)
  logger.streamConnect(connectionId, {
    ...correlation.toLogFields(),
    ip: request.ip,
    user_agent: request.headers['user-agent'],
  });

  const registration = registry.register(connectionId, {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    streamId,
    traceId,
  });

  if (!registration.success) {
    metrics.incRejectedConnections();

    logger.streamReject(connectionId, registration.reason, {
      ...correlation.toLogFields(),
      ip: request.ip,
    });

    reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Too many connections',
      code: registration.reason,
      retry: config.sse.retryTimeout,
    });
    return;
  }

  metrics.incStreamsOpened();
  metrics.incActiveStreams();

  // Read Last-Event-ID from request
  const lastEventId = request.headers['last-event-id'] || request.query.last_event_id || null;

  if (lastEventId) {
    logger.resumeAttempt(connectionId, lastEventId, correlation.toLogFields());
  }

  // Create SSE writer
  const writer = createSSEWriter(reply.raw, {
    connectionId,
    streamId,
    traceId,
    onClose: (reason) => {
      logger.debug('writer.close', `Writer closed: ${connectionId}`, {
        ...correlation.toLogFields(),
        reason,
      });
    },
    onError: (err, operation) => {
      logger.error('writer.error', `Writer error: ${connectionId}`, {
        ...correlation.toLogFields(),
        operation,
        error: err.message,
      });
      cleanupConnection(DisconnectReason.NETWORK_ERROR);
    },
  });

  writer.init();

  // Send control.open with stream_id (SSRK-186)
  writer.sendControl(
    'open',
    {
      stream_id: streamId,
      ...(traceId && { trace_id: traceId }),
      server_time: new Date().toISOString(),
      server_version: '1.0.0',
      tick_interval: config.sse.tickInterval,
      heartbeat_interval: config.sse.heartbeatInterval,
    },
    { retry: config.sse.retryTimeout }
  );

  // Create stream manager with heartbeat
  const stream = createStreamManager(writer, {
    connectionId,
    streamId,
    traceId,
    tickInterval: config.sse.tickInterval,
    heartbeatInterval: config.sse.heartbeatInterval,
    debug: config.log.heartbeats,
    onHeartbeatError: (info) => {
      metrics.incHeartbeatsFailed();
      logger.heartbeatFailed(connectionId, info.error, correlation.toLogFields());
      cleanupConnection(DisconnectReason.NETWORK_ERROR);
    },
  });

  // Wrap sendEvent to add correlation (SSRK-186)
  const originalSendEvent = writer.sendEvent.bind(writer);
  writer.sendEvent = (envelope) => {
    // Add stream_id to every event envelope (SSRK-186)
    const enrichedEnvelope = {
      ...envelope,
      stream_id: streamId,
    };

    // Add trace_id if present (SSRK-187)
    if (traceId) {
      enrichedEnvelope.trace_id = traceId;
    }

    const success = originalSendEvent(enrichedEnvelope);

    if (success) {
      metrics.incEventsSent();

      if (envelope.type !== 'system.heartbeat') {
        replayBuffer.add(enrichedEnvelope);
        metrics.incEventsBuffered();
      }

      registry.touch(connectionId);

      if (envelope.type === 'system.heartbeat') {
        metrics.incHeartbeatsSent();
        if (config.log.heartbeats) {
          logger.heartbeatSent(connectionId, correlation.toLogFields());
        }
      }
    }

    return success;
  };

  activeManagers.add(stream);

  const cleanupConnection = (reason) => {
    if (!registry.has(connectionId)) return;

    activeManagers.delete(stream);
    stream.stop();
    writer.close(reason);
    registry.unregister(connectionId, reason);

    metrics.decActiveStreams();
    metrics.incDisconnects(reason);

    logger.streamClose(connectionId, reason, {
      ...correlation.toLogFields(),
      duration_ms: Date.now() - registration.connectedAt,
    });
  };

  registry.setCleanup(connectionId, cleanupConnection);

  // Handle replay if Last-Event-ID provided
  if (lastEventId) {
    metrics.incReplaysAttempted();

    const replayResult = replayBuffer.getEventsAfter(lastEventId);

    if (!replayResult.found) {
      metrics.incReplaysFailed();
      metrics.incCannotResume(CannotResumeReason.EVENT_NOT_FOUND);

      logger.resumeCannotResume(connectionId, CannotResumeReason.EVENT_NOT_FOUND, {
        ...correlation.toLogFields(),
        requested_id: lastEventId,
        oldest_available: replayBuffer.oldestEventId,
      });

      writer.sendControl('cannot_resume', {
        code: CannotResumeReason.EVENT_NOT_FOUND,
        reason: 'events_expired',
        message: 'Requested events are no longer available in buffer',
        requestedId: lastEventId,
        oldestAvailable: replayBuffer.oldestEventId,
        newestAvailable: replayBuffer.newestEventId,
        action: 'start_fresh',
        stream_id: streamId,
        trace_id: traceId,
      });
    } else if (replayResult.events.length > 0) {
      metrics.incReplaysSucceeded();

      if (replayResult.truncated) {
        logger.replayTruncated(
          connectionId,
          replayResult.totalAvailable,
          replayResult.events.length,
          correlation.toLogFields()
        );

        writer.sendControl('replay_start', {
          reason: 'replay_truncated',
          message: 'Too many events to replay, sending partial batch',
          requestedId: lastEventId,
          totalAvailable: replayResult.totalAvailable,
          sending: replayResult.events.length,
          maxReplayBatch: config.sse.maxReplayBatch,
          stream_id: streamId,
          trace_id: traceId,
        });
      } else {
        logger.replayStart(connectionId, replayResult.events.length, correlation.toLogFields());

        writer.sendControl('replay_start', {
          reason: 'replay_started',
          requestedId: lastEventId,
          eventCount: replayResult.events.length,
          stream_id: streamId,
          trace_id: traceId,
        });
      }

      for (const event of replayResult.events) {
        originalSendEvent(event);
      }

      metrics.incReplayEventsSent(replayResult.events.length);

      logger.resumeSuccess(connectionId, replayResult.events.length, correlation.toLogFields());
      logger.replayEnd(connectionId, replayResult.events.length, correlation.toLogFields());

      writer.sendControl('replay_end', {
        reason: 'replay_complete',
        eventCount: replayResult.events.length,
        truncated: replayResult.truncated,
        stream_id: streamId,
        trace_id: traceId,
      });
    } else {
      metrics.incReplaysSucceeded();
      logger.resumeSuccess(connectionId, 0, correlation.toLogFields());

      writer.sendControl('replay_start', {
        reason: 'no_replay_needed',
        requestedId: lastEventId,
        eventCount: 0,
        stream_id: streamId,
        trace_id: traceId,
      });
    }
  }

  logger.streamOpen(connectionId, {
    ...correlation.toLogFields(),
    had_resume: !!lastEventId,
  });

  // Start live streaming
  stream.start();

  // Handle client disconnect
  request.raw.on('close', () => {
    cleanupConnection(DisconnectReason.CLIENT_CLOSE);
  });

  request.raw.on('error', (err) => {
    logger.error('request.error', `Request error: ${connectionId}`, {
      ...correlation.toLogFields(),
      error: err.message,
    });
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
 * Debug endpoint - drop all active SSE connections (server stays up, buffer intact)
 */
fastify.post('/debug/drop-connections', async (request, reply) => {
  if (config.nodeEnv !== 'development' && config.nodeEnv !== 'test') {
    reply.code(404).send({ error: 'Not found' });
    return;
  }

  const count = registry.size;
  registry.closeAll('test_drop');
  return { dropped: count };
});

/**
 * Debug endpoint - pause tick event generation on all active connections
 */
fastify.post('/debug/pause-events', async (request, reply) => {
  if (config.nodeEnv !== 'development' && config.nodeEnv !== 'test') {
    reply.code(404).send({ error: 'Not found' });
    return;
  }

  for (const manager of activeManagers) {
    if (manager.tickTimer) {
      clearInterval(manager.tickTimer);
      manager.tickTimer = null;
    }
  }
  return { paused: activeManagers.size };
});

/**
 * Debug endpoint - resume tick event generation on all active connections
 */
fastify.post('/debug/resume-events', async (request, reply) => {
  if (config.nodeEnv !== 'development' && config.nodeEnv !== 'test') {
    reply.code(404).send({ error: 'Not found' });
    return;
  }

  for (const manager of activeManagers) {
    if (manager.isRunning && !manager.tickTimer) {
      manager.tickTimer = setInterval(() => {
        manager.sendTick();
      }, manager.tickInterval);
    }
  }
  return { resumed: activeManagers.size };
});

/**
 * Debug endpoint - stop heartbeat schedulers on all active connections
 */
fastify.post('/debug/stop-heartbeats', async (request, reply) => {
  if (config.nodeEnv !== 'development' && config.nodeEnv !== 'test') {
    reply.code(404).send({ error: 'Not found' });
    return;
  }

  for (const manager of activeManagers) {
    manager.heartbeatScheduler.stop();
  }
  return { stopped: activeManagers.size };
});

/**
 * Debug endpoint - resume heartbeat schedulers on all active connections
 */
fastify.post('/debug/resume-heartbeats', async (request, reply) => {
  if (config.nodeEnv !== 'development' && config.nodeEnv !== 'test') {
    reply.code(404).send({ error: 'Not found' });
    return;
  }

  for (const manager of activeManagers) {
    manager.heartbeatScheduler.start();
  }
  return { resumed: activeManagers.size };
});

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('server.shutdown', `Shutdown signal received: ${signal}`, {
    active_connections: registry.size,
    buffer_size: replayBuffer.size,
  });

  fastify.server.unref();

  const gracePeriod = config.shutdown.gracePeriodMs;
  logger.info('server.shutdown', `Waiting ${gracePeriod}ms for connections to close`);

  await new Promise((resolve) => setTimeout(resolve, gracePeriod));

  logger.info('server.shutdown', `Closing ${registry.size} remaining connections`);
  registry.closeAll(DisconnectReason.SERVER_SHUTDOWN);

  await fastify.close();

  logger.info('server.shutdown', 'Server stopped');
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

    logger.info('server.start', `Server started`, {
      host: config.host,
      port: config.port,
      tick_interval: config.sse.tickInterval,
      heartbeat_interval: config.sse.heartbeatInterval,
      max_buffer_size: config.sse.maxBufferSize,
      max_connections: config.connections.maxConcurrent,
    });

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           SSE Streaming Reliability Kit v1.0.0            ║
╠═══════════════════════════════════════════════════════════╣
║  Server:     http://${config.host}:${config.port}                        ║
║  Health:     http://${config.host}:${config.port}/health                 ║
║  Metrics:    http://${config.host}:${config.port}/metrics                ║
║  Stream:     http://${config.host}:${config.port}/stream                 ║
╠═══════════════════════════════════════════════════════════╣
║  Log Level:          ${String(config.log.level).padEnd(6)}                           ║
║  Tick Interval:      ${String(config.sse.tickInterval).padEnd(6)}ms                        ║
║  Heartbeat Interval: ${String(config.sse.heartbeatInterval).padEnd(6)}ms                        ║
║  Max Buffer Size:    ${String(config.sse.maxBufferSize).padEnd(6)}                          ║
║  Max Connections:    ${String(config.connections.maxConcurrent).padEnd(6)}                          ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    logger.error('server.start', 'Failed to start server', { error: err.message });
    process.exit(1);
  }
};

start();
