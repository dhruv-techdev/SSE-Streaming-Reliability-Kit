/**
 * Structured Logger (SSRK-174)
 * Defines log schema and provides consistent logging utilities
 */

/**
 * Log Levels (SSRK-181)
 */
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

/**
 * Log Level Priority (higher = more important)
 */
const LOG_LEVEL_PRIORITY = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Log Components
 */
export const LogComponent = {
  // Server components
  SERVER: 'server',
  STREAM: 'stream',
  CONNECTION: 'connection',
  HEARTBEAT: 'heartbeat',
  REPLAY: 'replay',
  METRICS: 'metrics',
  
  // Client components
  CLIENT: 'client',
  CONNECTOR: 'connector',
  RECONNECT: 'reconnect',
  LIVENESS: 'liveness',
  DEDUPE: 'dedupe',
  ORDERING: 'ordering',
  RESUME: 'resume',
};

/**
 * Log Events (SSRK-174)
 * Consistent event names for searchability
 */
export const LogEvent = {
  // Server stream lifecycle (SSRK-177)
  STREAM_CONNECT: 'stream.connect',
  STREAM_OPEN: 'stream.open',
  STREAM_CLOSE: 'stream.close',
  STREAM_REJECT: 'stream.reject',
  
  // Client lifecycle (SSRK-178)
  CLIENT_CONNECTING: 'client.connecting',
  CLIENT_OPEN: 'client.open',
  CLIENT_RETRY_SCHEDULED: 'client.retry_scheduled',
  CLIENT_GIVE_UP: 'client.give_up',
  CLIENT_STOP: 'client.stop',
  CLIENT_CLOSE: 'client.close',
  
  // Resume events (SSRK-179)
  RESUME_ATTEMPT: 'resume.attempt',
  RESUME_SUCCESS: 'resume.success',
  RESUME_CANNOT_RESUME: 'resume.cannot_resume',
  RESUME_FAILURE: 'resume.failure',
  
  // Heartbeat/Liveness
  HEARTBEAT_SENT: 'heartbeat.sent',
  HEARTBEAT_FAILED: 'heartbeat.failed',
  LIVENESS_FAILURE: 'liveness.failure',
  
  // Data events (SSRK-180)
  PARSE_ERROR: 'parse.error',
  VALIDATION_ERROR: 'validation.error',
  
  // Replay
  REPLAY_START: 'replay.start',
  REPLAY_END: 'replay.end',
  REPLAY_TRUNCATED: 'replay.truncated',
  
  // Dedupe/Ordering
  DUPLICATE_DETECTED: 'duplicate.detected',
  OUT_OF_ORDER: 'out_of_order.detected',
};

/**
 * Log Schema (SSRK-174)
 * 
 * Required fields:
 * - ts: ISO timestamp
 * - level: debug|info|warn|error
 * - component: server|client|stream|etc
 * - event: dot-separated event name
 * - message: human-readable description
 * 
 * Optional fields:
 * - stream_id: connection/stream identifier
 * - details: additional context object
 */

/**
 * Base Logger Class (SSRK-174, SSRK-181)
 */
export class Logger {
  /**
   * Create a logger
   * @param {Object} options - Configuration
   */
  constructor(options = {}) {
    this.component = options.component || 'app';
    this.minLevel = options.level || LogLevel.INFO;
    this.streamId = options.streamId || null;
    this.output = options.output || console;
    this.enabled = options.enabled !== false;
    
    // Additional context to include in all logs
    this._context = options.context || {};
  }

  /**
   * Check if log level should be output (SSRK-181)
   */
  _shouldLog(level) {
    if (!this.enabled) return false;
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  /**
   * Format log entry as JSON (SSRK-174)
   */
  _formatLog(level, event, message, details = {}) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      component: this.component,
      event,
      message,
    };

    if (this.streamId) {
      entry.stream_id = this.streamId;
    }

    // Merge additional context
    if (Object.keys(this._context).length > 0) {
      Object.assign(entry, this._context);
    }

    // Add details if provided (SSRK-180: don't leak sensitive data)
    if (details && Object.keys(details).length > 0) {
      entry.details = this._sanitizeDetails(details);
    }

    return entry;
  }

  /**
   * Sanitize details to prevent leaking sensitive data (SSRK-180)
   */
  _sanitizeDetails(details) {
    const sanitized = { ...details };
    
    // Remove potentially sensitive fields
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential'];
    
    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(s => lowerKey.includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
      
      // Truncate very long strings
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 500) {
        sanitized[key] = sanitized[key].slice(0, 500) + '...[truncated]';
      }
    }
    
    return sanitized;
  }

  /**
   * Output log entry
   */
  _log(level, event, message, details) {
    if (!this._shouldLog(level)) return;

    const entry = this._formatLog(level, event, message, details);
    const json = JSON.stringify(entry);

    switch (level) {
      case LogLevel.ERROR:
        this.output.error(json);
        break;
      case LogLevel.WARN:
        this.output.warn(json);
        break;
      case LogLevel.DEBUG:
        this.output.debug ? this.output.debug(json) : this.output.log(json);
        break;
      default:
        this.output.log(json);
    }
    
    return entry;
  }

  /**
   * Log at DEBUG level
   */
  debug(event, message, details) {
    return this._log(LogLevel.DEBUG, event, message, details);
  }

  /**
   * Log at INFO level
   */
  info(event, message, details) {
    return this._log(LogLevel.INFO, event, message, details);
  }

  /**
   * Log at WARN level
   */
  warn(event, message, details) {
    return this._log(LogLevel.WARN, event, message, details);
  }

  /**
   * Log at ERROR level
   */
  error(event, message, details) {
    return this._log(LogLevel.ERROR, event, message, details);
  }

  /**
   * Create a child logger with additional context
   */
  child(options) {
    return new Logger({
      component: options.component || this.component,
      level: options.level || this.minLevel,
      streamId: options.streamId || this.streamId,
      output: this.output,
      enabled: this.enabled,
      context: { ...this._context, ...options.context },
    });
  }

  /**
   * Set stream ID
   */
  setStreamId(streamId) {
    this.streamId = streamId;
  }

  /**
   * Set log level (SSRK-181)
   */
  setLevel(level) {
    this.minLevel = level;
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

/**
 * Create a logger instance
 */
export function createLogger(options) {
  return new Logger(options);
}

export default Logger;
