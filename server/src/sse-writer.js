/**
 * SSE Writer Utility (SSRK-69, SSRK-78)
 * Standardizes how events are formatted and flushed
 * Includes safe error handling for dead sockets
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
  }

  /**
   * Initialize the SSE connection with proper headers (ST-01)
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
   * Safe write wrapper (ST-04)
   * Catches errors when writing to dead sockets
   */
  safeWrite(data) {
    if (!this.isOpen) return false;
    
    try {
      // Check if socket is still writable
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
   * Handle write errors (ST-04)
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
   * @param {Object} envelope - Event envelope object
   */
  sendEvent(envelope) {
    if (!this.isOpen) return false;
    
    const sse = encodeSSE(envelope);
    const success = this.safeWrite(sse);
    
    if (success) {
      this.eventCount++;
      this.lastEventId = envelope.event_id;
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
   * Send a heartbeat event (ST-05)
   */
  sendHeartbeat() {
    const envelope = createHeartbeat();
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
    
    // Try to send close event
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
    // Also check underlying socket
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
