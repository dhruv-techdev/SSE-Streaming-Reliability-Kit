/**
 * SSE Writer Utility (SSRK-69)
 * Standardizes how events are formatted and flushed
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
  }

  /**
   * Initialize the SSE connection with proper headers (ST-01)
   */
  init() {
    this.res.writeHead(200, SSEHeaders);
    this.isOpen = true;
    return this;
  }

  /**
   * Send a raw event envelope
   * @param {Object} envelope - Event envelope object
   */
  sendEvent(envelope) {
    if (!this.isOpen) return false;
    
    const sse = encodeSSE(envelope);
    this.res.write(sse);
    this.eventCount++;
    this.lastEventId = envelope.event_id;
    return true;
  }

  /**
   * Send a domain event
   * @param {string} entity - Domain entity
   * @param {string} action - Action performed
   * @param {Object} payload - Event data
   * @param {Object} options - Optional fields
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
   * @param {string} controlType - open, close, reconnect
   * @param {Object} payload - Control data
   * @param {Object} options - Optional fields
   */
  sendControl(controlType, payload = {}, options = {}) {
    const envelope = createControl(controlType, payload, options);
    return this.sendEvent(envelope);
  }

  /**
   * Send an error event
   * @param {string} message - Error message
   * @param {string} code - Error code
   * @param {Object} options - Optional fields
   */
  sendError(message, code = 'UNKNOWN_ERROR', options = {}) {
    const envelope = createError(message, code, options);
    return this.sendEvent(envelope);
  }

  /**
   * Send a custom event
   * @param {string} type - Event type
   * @param {Object} payload - Event data
   * @param {Object} options - Optional fields
   */
  send(type, payload = {}, options = {}) {
    const envelope = createEnvelope(type, payload, options);
    return this.sendEvent(envelope);
  }

  /**
   * Close the SSE connection
   * @param {string} reason - Disconnect reason
   */
  close(reason = 'stream_ended') {
    if (!this.isOpen) return;
    
    this.sendControl('close', { reason });
    this.isOpen = false;
    this.res.end();
    this.onClose(reason);
  }

  /**
   * Check if connection is still open
   */
  get connected() {
    return this.isOpen;
  }

  /**
   * Get statistics
   */
  get stats() {
    return {
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
