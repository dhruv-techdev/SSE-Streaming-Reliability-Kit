/**
 * SSE Writer Utility (SSRK-116, SSRK-117)
 * Standardizes event formatting with safe writes and correct headers
 */
import {
  encodeSSE,
  createEnvelope,
  createHeartbeat,
  createControl,
  createDomainEvent,
  createError,
  SSEHeaders,
} from '../../shared/src/index.js';

export class SSEWriter {
  constructor(response, options = {}) {
    this.res = response;
    this.isOpen = false;
    this.eventCount = 0;
    this.lastEventId = null;
    this.onClose = options.onClose || (() => {});
    this.onError = options.onError || (() => {});
    this.connectionId = options.connectionId || 'unknown';

    // Heartbeat tracking (SSRK-118)
    this.heartbeatCount = 0;
  }

  /**
   * Initialize the SSE connection with proper headers (SSRK-117)
   * Headers include:
   * - Content-Type: text/event-stream
   * - Cache-Control: no-cache
   * - Connection: keep-alive
   * - X-Accel-Buffering: no (disables NGINX buffering)
   */
  init() {
    try {
      this.res.writeHead(200, SSEHeaders);
      this.isOpen = true;
      return this;
    } catch (err) {
      this.handleWriteError(err, 'init');
      return this;
    }
  }

  /**
   * Safe write wrapper (SSRK-116)
   * Catches errors when writing to dead sockets
   */
  safeWrite(data) {
    if (!this.isOpen) return false;

    try {
      if (this.res.writableEnded || this.res.destroyed) {
        this.handleWriteError(new Error('Socket closed'), 'write');
        return false;
      }

      this.res.write(data);
      return true;
    } catch (err) {
      this.handleWriteError(err, 'write');
      return false;
    }
  }

  /**
   * Handle write errors (SSRK-116)
   * Failed writes trigger cleanup for that connection
   */
  handleWriteError(err, operation) {
    if (this.isOpen) {
      this.isOpen = false;
      console.log(`[SSE-WRITER] [ERROR] ${this.connectionId} ${operation}: ${err.message}`);
      this.onError(err, operation);
    }
  }

  /**
   * Send a raw event envelope
   */
  sendEvent(envelope) {
    if (!this.isOpen) return false;

    const sse = encodeSSE(envelope);
    const success = this.safeWrite(sse);

    if (success) {
      this.eventCount++;
      this.lastEventId = envelope.event_id;

      // Track heartbeats separately (SSRK-118)
      if (envelope.type === 'system.heartbeat') {
        this.heartbeatCount++;
      }
    }

    return success;
  }

  /**
   * Send a domain event
   */
  sendDomainEvent(entity, action, payload, options = {}) {
    const envelope = createDomainEvent(entity, action, payload, options);
    return this.sendEvent(envelope);
  }

  /**
   * Send a heartbeat event
   */
  sendHeartbeat(options = {}) {
    const envelope = createHeartbeat({
      ...options,
      connection_id: this.connectionId,
    });
    return this.sendEvent(envelope);
  }

  /**
   * Send a control event
   */
  sendControl(controlType, payload = {}, options = {}) {
    const envelope = createControl(controlType, payload, options);
    return this.sendEvent(envelope);
  }

  /**
   * Send an error event
   */
  sendError(message, code = 'UNKNOWN_ERROR', options = {}) {
    const envelope = createError(message, code, options);
    return this.sendEvent(envelope);
  }

  /**
   * Send a custom event
   */
  send(type, payload = {}, options = {}) {
    const envelope = createEnvelope(type, payload, options);
    return this.sendEvent(envelope);
  }

  /**
   * Close the SSE connection
   */
  close(reason = 'stream_ended') {
    if (!this.isOpen) return;

    try {
      this.sendControl('close', { reason });
    } catch (err) {
      // Ignore - socket may already be dead
    }

    this.isOpen = false;

    try {
      this.res.end();
    } catch (err) {
      // Ignore - socket may already be dead
    }

    this.onClose(reason);
  }

  /**
   * Check if connection is still open
   */
  get connected() {
    if (this.isOpen && (this.res.writableEnded || this.res.destroyed)) {
      this.isOpen = false;
    }
    return this.isOpen;
  }

  /**
   * Get statistics
   */
  get stats() {
    return {
      connectionId: this.connectionId,
      eventCount: this.eventCount,
      heartbeatCount: this.heartbeatCount,
      lastEventId: this.lastEventId,
      isOpen: this.isOpen,
    };
  }
}

/**
 * Factory function to create SSE writer
 */
export function createSSEWriter(response, options) {
  return new SSEWriter(response, options);
}
