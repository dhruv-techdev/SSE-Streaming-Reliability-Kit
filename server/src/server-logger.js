/**
 * Server Logger (SSRK-175)
 * Structured logging wrapper for server-side operations
 */
import { createLogger, LogLevel, LogComponent, LogEvent } from '../../shared/src/logger.js';

/**
 * Create a server logger
 */
export function createServerLogger(options = {}) {
  const logger = createLogger({
    component: LogComponent.SERVER,
    level: options.level || process.env.LOG_LEVEL || LogLevel.INFO,
    enabled: options.enabled !== false,
    context: options.context || {},
  });

  return {
    logger,

    // Stream lifecycle (SSRK-177)
    streamConnect(connectionId, details = {}) {
      logger.info(LogEvent.STREAM_CONNECT, `Stream connecting: ${connectionId}`, {
        connection_id: connectionId,
        ...details,
      });
    },

    streamOpen(connectionId, details = {}) {
      logger.info(LogEvent.STREAM_OPEN, `Stream opened: ${connectionId}`, {
        connection_id: connectionId,
        ...details,
      });
    },

    streamClose(connectionId, reason, details = {}) {
      logger.info(LogEvent.STREAM_CLOSE, `Stream closed: ${connectionId} (${reason})`, {
        connection_id: connectionId,
        reason,
        ...details,
      });
    },

    streamReject(connectionId, reason, details = {}) {
      logger.warn(LogEvent.STREAM_REJECT, `Stream rejected: ${connectionId} (${reason})`, {
        connection_id: connectionId,
        reason,
        ...details,
      });
    },

    // Resume events (SSRK-179)
    resumeAttempt(connectionId, lastEventId, details = {}) {
      logger.info(LogEvent.RESUME_ATTEMPT, `Resume attempt: ${connectionId}`, {
        connection_id: connectionId,
        last_event_id: lastEventId,
        ...details,
      });
    },

    resumeSuccess(connectionId, eventCount, details = {}) {
      logger.info(
        LogEvent.RESUME_SUCCESS,
        `Resume success: ${connectionId} (${eventCount} events)`,
        {
          connection_id: connectionId,
          event_count: eventCount,
          ...details,
        }
      );
    },

    resumeCannotResume(connectionId, reason, details = {}) {
      logger.warn(LogEvent.RESUME_CANNOT_RESUME, `Cannot resume: ${connectionId} (${reason})`, {
        connection_id: connectionId,
        reason,
        ...details,
      });
    },

    // Replay events
    replayStart(connectionId, eventCount, details = {}) {
      logger.info(LogEvent.REPLAY_START, `Replay started: ${connectionId} (${eventCount} events)`, {
        connection_id: connectionId,
        event_count: eventCount,
        ...details,
      });
    },

    replayEnd(connectionId, eventCount, details = {}) {
      logger.info(LogEvent.REPLAY_END, `Replay completed: ${connectionId} (${eventCount} events)`, {
        connection_id: connectionId,
        event_count: eventCount,
        ...details,
      });
    },

    replayTruncated(connectionId, requested, sent, details = {}) {
      logger.warn(
        LogEvent.REPLAY_TRUNCATED,
        `Replay truncated: ${connectionId} (${sent}/${requested})`,
        {
          connection_id: connectionId,
          requested,
          sent,
          ...details,
        }
      );
    },

    // Heartbeat events
    heartbeatSent(connectionId, details = {}) {
      logger.debug(LogEvent.HEARTBEAT_SENT, `Heartbeat sent: ${connectionId}`, {
        connection_id: connectionId,
        ...details,
      });
    },

    heartbeatFailed(connectionId, error, details = {}) {
      logger.error(LogEvent.HEARTBEAT_FAILED, `Heartbeat failed: ${connectionId}`, {
        connection_id: connectionId,
        error: error?.message || error,
        ...details,
      });
    },

    // Parse/validation errors (SSRK-180)
    parseError(connectionId, error, details = {}) {
      logger.error(LogEvent.PARSE_ERROR, `Parse error: ${connectionId}`, {
        connection_id: connectionId,
        error: error?.message || error,
        ...details,
      });
    },

    validationError(connectionId, errors, details = {}) {
      logger.error(LogEvent.VALIDATION_ERROR, `Validation error: ${connectionId}`, {
        connection_id: connectionId,
        errors,
        ...details,
      });
    },

    // Generic log methods
    debug: (event, message, details) => logger.debug(event, message, details),
    info: (event, message, details) => logger.info(event, message, details),
    warn: (event, message, details) => logger.warn(event, message, details),
    error: (event, message, details) => logger.error(event, message, details),

    // Create child logger for specific connection
    forConnection(connectionId) {
      return createServerLogger({
        level: logger.minLevel,
        enabled: logger.enabled,
        context: { connection_id: connectionId },
      });
    },

    setLevel: (level) => logger.setLevel(level),
    setEnabled: (enabled) => logger.setEnabled(enabled),
  };
}

// Default server logger instance
let defaultServerLogger = null;

export function getServerLogger(options) {
  if (!defaultServerLogger) {
    defaultServerLogger = createServerLogger(options);
  }
  return defaultServerLogger;
}

export default { createServerLogger, getServerLogger };
