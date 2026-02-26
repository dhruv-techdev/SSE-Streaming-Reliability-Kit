/**
 * Client Logger (SSRK-176)
 * Structured logging wrapper for client-side operations
 */
import { createLogger, LogLevel, LogComponent, LogEvent } from '../../shared/src/logger.js';

/**
 * Create a client logger
 */
export function createClientLogger(options = {}) {
  const logger = createLogger({
    component: LogComponent.CLIENT,
    level: options.level || LogLevel.INFO,
    streamId: options.streamId,
    enabled: options.enabled !== false,
    context: options.context || {},
  });

  return {
    logger,

    // Client lifecycle (SSRK-178)
    connecting(url, details = {}) {
      logger.info(LogEvent.CLIENT_CONNECTING, `Connecting to ${url}`, {
        url,
        ...details,
      });
    },

    open(url, details = {}) {
      logger.info(LogEvent.CLIENT_OPEN, `Connected to ${url}`, {
        url,
        ...details,
      });
    },

    retryScheduled(attempt, delayMs, reason, details = {}) {
      logger.info(LogEvent.CLIENT_RETRY_SCHEDULED, `Retry scheduled: attempt ${attempt} in ${delayMs}ms`, {
        attempt,
        delay_ms: delayMs,
        reason,
        ...details,
      });
    },

    giveUp(reason, attempts, elapsedMs, details = {}) {
      logger.warn(LogEvent.CLIENT_GIVE_UP, `Gave up after ${attempts} attempts (${reason})`, {
        reason,
        attempts,
        elapsed_ms: elapsedMs,
        ...details,
      });
    },

    stop(reason, details = {}) {
      logger.info(LogEvent.CLIENT_STOP, `Client stopped: ${reason}`, {
        reason,
        ...details,
      });
    },

    close(reason, willReconnect, details = {}) {
      logger.info(LogEvent.CLIENT_CLOSE, `Connection closed: ${reason}`, {
        reason,
        will_reconnect: willReconnect,
        ...details,
      });
    },

    // Resume events (SSRK-179)
    resumeAttempt(lastEventId, details = {}) {
      logger.info(LogEvent.RESUME_ATTEMPT, `Attempting resume from ${lastEventId?.slice(0, 20)}...`, {
        last_event_id: lastEventId,
        ...details,
      });
    },

    resumeSuccess(eventCount, details = {}) {
      logger.info(LogEvent.RESUME_SUCCESS, `Resume successful (${eventCount} events replayed)`, {
        event_count: eventCount,
        ...details,
      });
    },

    resumeCannotResume(reason, lastEventId, details = {}) {
      logger.warn(LogEvent.RESUME_CANNOT_RESUME, `Cannot resume: ${reason}`, {
        reason,
        last_event_id: lastEventId,
        ...details,
      });
    },

    resumeFailure(reason, details = {}) {
      logger.error(LogEvent.RESUME_FAILURE, `Resume failed: ${reason}`, {
        reason,
        ...details,
      });
    },

    // Liveness events
    livenessFailure(elapsedMs, timeoutMs, details = {}) {
      logger.warn(LogEvent.LIVENESS_FAILURE, `Liveness failure: ${elapsedMs}ms since last heartbeat`, {
        elapsed_ms: elapsedMs,
        timeout_ms: timeoutMs,
        ...details,
      });
    },

    // Dedupe/ordering events
    duplicateDetected(eventId, eventType, details = {}) {
      logger.debug(LogEvent.DUPLICATE_DETECTED, `Duplicate detected: ${eventId}`, {
        event_id: eventId,
        event_type: eventType,
        ...details,
      });
    },

    outOfOrder(eventId, reason, details = {}) {
      logger.debug(LogEvent.OUT_OF_ORDER, `Out-of-order event: ${eventId} (${reason})`, {
        event_id: eventId,
        reason,
        ...details,
      });
    },

    // Parse/validation errors (SSRK-180)
    parseError(error, rawData, details = {}) {
      logger.error(LogEvent.PARSE_ERROR, `Parse error: ${error}`, {
        error,
        raw_preview: rawData?.slice(0, 100),
        ...details,
      });
    },

    validationError(errors, envelope, details = {}) {
      logger.error(LogEvent.VALIDATION_ERROR, `Validation error`, {
        errors,
        event_id: envelope?.event_id,
        event_type: envelope?.type,
        ...details,
      });
    },

    // Generic log methods
    debug: (event, message, details) => logger.debug(event, message, details),
    info: (event, message, details) => logger.info(event, message, details),
    warn: (event, message, details) => logger.warn(event, message, details),
    error: (event, message, details) => logger.error(event, message, details),

    setLevel: (level) => logger.setLevel(level),
    setEnabled: (enabled) => logger.setEnabled(enabled),
    setStreamId: (streamId) => logger.setStreamId(streamId),
  };
}

// Default client logger instance
let defaultClientLogger = null;

export function getClientLogger(options) {
  if (!defaultClientLogger) {
    defaultClientLogger = createClientLogger(options);
  }
  return defaultClientLogger;
}

export default { createClientLogger, getClientLogger };
