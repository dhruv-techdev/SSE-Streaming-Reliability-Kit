/**
 * SSE Client Connector (US-07, US-08)
 * Reusable entrypoint with state machine lifecycle management
 */
import http from 'http';
import https from 'https';
import {
  parseSSEChunk,
  decodeSSE,
  validateEvent,
  Defaults,
  ReservedEventTypes,
} from '../../shared/src/index.js';
import {
  StateMachine,
  ConnectionState,
  TransitionReason,
} from './state-machine.js';

/**
 * SSE Connector Class with State Machine
 */
export class SSEConnector {
  /**
   * Create a new SSE connector
   * @param {string} url - SSE endpoint URL
   * @param {Object} options - Configuration options
   */
  constructor(url, options = {}) {
    this.url = new URL(url);
    this.options = {
      // Timeouts
      timeout: options.timeout || Defaults.CLIENT_TIMEOUT_MS,
      retryInterval: options.retryInterval || Defaults.RETRY_INTERVAL_MS,
      maxRetries: options.maxRetries || Defaults.MAX_RETRY_ATTEMPTS,
      
      // Auto-reconnect
      autoReconnect: options.autoReconnect !== false,
      
      // Headers
      headers: options.headers || {},
      
      // Lifecycle callbacks
      onOpen: options.onOpen || (() => {}),
      onEvent: options.onEvent || (() => {}),
      onError: options.onError || (() => {}),
      onClose: options.onClose || (() => {}),
      
      // State change callback (SSRK-92)
      onStateChange: options.onStateChange || null,
      
      // Reserved event handlers
      onHeartbeat: options.onHeartbeat || null,
      onControl: options.onControl || null,
      onSystemError: options.onSystemError || null,
      
      // Validation
      validateEnvelope: options.validateEnvelope !== false,
      
      // Debug logging (SSRK-95)
      debug: options.debug || false,
    };

    // State machine (SSRK-91)
    this._stateMachine = new StateMachine({
      debug: this.options.debug,
      onStateChange: (event) => this._handleStateChange(event),
    });

    // Connection state
    this.lastEventId = null;
    this.retryCount = 0;
    this.request = null;
    this.response = null;
    this.timeoutTimer = null;
    this.retryTimer = null;
    this._stopped = false;
    
    // Stats
    this.stats = {
      eventsReceived: 0,
      bytesReceived: 0,
      connectedAt: null,
      disconnectedAt: null,
      reconnectCount: 0,
    };
  }

  /**
   * Handle state change events (SSRK-92)
   */
  _handleStateChange(event) {
    if (this.options.debug) {
      console.log(`[CONNECTOR] State: ${event.previous} → ${event.current} (${event.reason})`);
    }
    
    if (this.options.onStateChange) {
      this.options.onStateChange(event);
    }
  }

  /**
   * Connect to the SSE server
   * @returns {SSEConnector} this
   */
  connect() {
    if (this._stopped) {
      this._stopped = false;
      this._stateMachine.reset();
    }

    if (this._stateMachine.is(ConnectionState.OPEN) || 
        this._stateMachine.is(ConnectionState.CONNECTING)) {
      return this;
    }

    // Transition to CONNECTING (SSRK-93)
    if (this._stateMachine.is(ConnectionState.IDLE) || 
        this._stateMachine.is(ConnectionState.RETRYING)) {
      this._stateMachine.connect();
    }
    
    this._doConnect();
    return this;
  }

  /**
   * Internal connect logic
   */
  _doConnect() {
    if (this._stopped) return;

    const protocol = this.url.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      hostname: this.url.hostname,
      port: this.url.port || (this.url.protocol === 'https:' ? 443 : 80),
      path: this.url.pathname + this.url.search,
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...this.options.headers,
      },
    };

    // Add Last-Event-ID for resume
    if (this.lastEventId) {
      requestOptions.headers['Last-Event-ID'] = this.lastEventId;
    }

    this.request = protocol.get(requestOptions, (res) => {
      this.response = res;
      this._handleResponse(res);
    });

    this.request.on('error', (err) => {
      this._handleError(err, 'request', TransitionReason.NETWORK_ERROR);
    });

    this.request.on('timeout', () => {
      this._handleError(new Error('Request timeout'), 'timeout', TransitionReason.CONNECTION_TIMEOUT);
    });

    // Set request timeout
    this.request.setTimeout(this.options.timeout);
  }

  /**
   * Handle HTTP response (SSRK-93)
   */
  _handleResponse(res) {
    if (this._stopped) return;

    if (res.statusCode !== 200) {
      this._handleError(
        new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`),
        'http',
        TransitionReason.SERVER_ERROR
      );
      return;
    }

    // Verify content type
    const contentType = res.headers['content-type'];
    if (!contentType || !contentType.includes('text/event-stream')) {
      this._handleError(
        new Error(`Invalid Content-Type: ${contentType}`),
        'content-type',
        TransitionReason.SERVER_ERROR
      );
      return;
    }

    // Connection established - transition to OPEN (SSRK-93)
    this._stateMachine.connected();
    this.retryCount = 0;
    this.stats.connectedAt = Date.now();
    this._resetTimeout();

    // Notify onOpen callback
    this.options.onOpen({
      url: this.url.href,
      lastEventId: this.lastEventId,
      state: this._stateMachine.state,
    });

    // Handle incoming data
    let buffer = '';
    
    res.on('data', (chunk) => {
      if (this._stopped) return;
      
      this._resetTimeout();
      this.stats.bytesReceived += chunk.length;
      
      buffer += chunk.toString();
      
      // Process complete events (separated by \n\n)
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      
      for (const part of parts) {
        if (part.trim()) {
          this._processEvent(part + '\n\n');
        }
      }
    });

    res.on('end', () => {
      if (!this._stopped) {
        this._handleClose(TransitionReason.SERVER_CLOSE);
      }
    });

    res.on('error', (err) => {
      this._handleError(err, 'response', TransitionReason.NETWORK_ERROR);
    });
  }

  /**
   * Process a single SSE event
   */
  _processEvent(raw) {
    if (this._stopped) return;

    const parsed = parseSSEChunk(raw);
    
    // Update last event ID
    if (parsed.id) {
      this.lastEventId = parsed.id;
    }

    // Update retry interval if server suggests one
    if (parsed.retry) {
      this.options.retryInterval = parsed.retry;
    }

    // Parse data field
    if (!parsed.data) {
      return;
    }

    const { envelope, error } = decodeSSE(parsed.data);
    
    if (error) {
      this._handleParseError(error, raw);
      return;
    }

    // Validate envelope
    if (this.options.validateEnvelope) {
      const validation = validateEvent(envelope);
      if (!validation.valid) {
        this._handleValidationError(validation.errors, envelope);
        return;
      }
    }

    this.stats.eventsReceived++;

    // Route event by type
    this._routeEvent(envelope);
  }

  /**
   * Route event to appropriate handler
   */
  _routeEvent(envelope) {
    const { type } = envelope;

    // System heartbeat
    if (type === ReservedEventTypes.HEARTBEAT) {
      if (this.options.onHeartbeat) {
        this.options.onHeartbeat(envelope);
      }
      return;
    }

    // System error
    if (type === ReservedEventTypes.ERROR) {
      if (this.options.onSystemError) {
        this.options.onSystemError(envelope);
      } else {
        this.options.onError({
          type: 'system_error',
          envelope,
        });
      }
      return;
    }

    // Control events
    if (type.startsWith('control.')) {
      if (this.options.onControl) {
        this.options.onControl(envelope);
      }
    }

    // All domain events and control events go to onEvent
    this.options.onEvent(envelope);
  }

  /**
   * Handle parse errors (SSRK-93)
   */
  _handleParseError(error, raw) {
    // Don't transition to ERROR for parse errors, just notify
    this.options.onError({
      type: 'parse_error',
      message: error,
      raw: raw.slice(0, 200),
    });
  }

  /**
   * Handle validation errors
   */
  _handleValidationError(errors, envelope) {
    this.options.onError({
      type: 'validation_error',
      message: 'Invalid envelope structure',
      errors,
      envelope,
    });
  }

  /**
   * Handle connection errors (SSRK-93)
   */
  _handleError(err, source, reason) {
    if (this._stopped) return;

    this.stats.disconnectedAt = Date.now();
    this._clearTimeout();
    this._cleanup();

    // Transition to ERROR state (SSRK-93)
    this._stateMachine.error(reason, { source, message: err.message });

    this.options.onError({
      type: 'connection_error',
      source,
      message: err.message,
      state: this._stateMachine.state,
    });

    if (!this._stopped && this.options.autoReconnect && this.retryCount < this.options.maxRetries) {
      this._scheduleReconnect();
    } else {
      // Transition to CLOSED (SSRK-93)
      this._stateMachine.close(TransitionReason.RETRY_EXHAUSTED);
      this.options.onClose({
        reason: 'error',
        error: err.message,
        willReconnect: false,
        state: this._stateMachine.state,
      });
    }
  }

  /**
   * Handle connection close (SSRK-93)
   */
  _handleClose(reason) {
    if (this._stopped) return;

    this.stats.disconnectedAt = Date.now();
    this._clearTimeout();
    this._cleanup();

    // Transition to ERROR then possibly RETRYING (SSRK-93)
    this._stateMachine.error(reason);

    if (!this._stopped && this.options.autoReconnect && this.retryCount < this.options.maxRetries) {
      this.options.onClose({
        reason,
        willReconnect: true,
        retryIn: this.options.retryInterval,
        state: this._stateMachine.state,
      });
      this._scheduleReconnect();
    } else {
      this._stateMachine.close(reason);
      this.options.onClose({
        reason,
        willReconnect: false,
        state: this._stateMachine.state,
      });
    }
  }

  /**
   * Schedule reconnection attempt (SSRK-93)
   */
  _scheduleReconnect() {
    if (this._stopped) return;

    // Transition to RETRYING
    this._stateMachine.retry();
    
    this.retryCount++;
    this.stats.reconnectCount++;

    this.retryTimer = setTimeout(() => {
      if (!this._stopped) {
        this._stateMachine.retrying(); // Back to CONNECTING
        this._doConnect();
      }
    }, this.options.retryInterval);
  }

  /**
   * Reset the timeout timer
   */
  _resetTimeout() {
    this._clearTimeout();
    this.timeoutTimer = setTimeout(() => {
      if (!this._stopped) {
        this._handleError(
          new Error('Connection timeout - no data received'),
          'timeout',
          TransitionReason.CONNECTION_TIMEOUT
        );
      }
    }, this.options.timeout);
  }

  /**
   * Clear the timeout timer
   */
  _clearTimeout() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Cleanup connection resources
   */
  _cleanup() {
    if (this.response) {
      this.response.removeAllListeners();
      this.response = null;
    }
  }

  /**
   * Stop and disconnect (SSRK-94)
   * This prevents any further reconnection attempts
   */
  stop() {
    this._stopped = true;
    this._clearTimeout();
    
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.request) {
      this.request.destroy();
      this.request = null;
    }

    this._cleanup();

    // Force close regardless of current state (SSRK-94)
    this._stateMachine.forceClose(TransitionReason.USER_STOP);
    this.stats.disconnectedAt = Date.now();
  }

  /**
   * Alias for stop() - disconnect from the server
   */
  disconnect() {
    this.stop();
  }

  /**
   * Get current connection state
   */
  getState() {
    return this._stateMachine.state;
  }

  /**
   * Get state machine instance (for advanced usage)
   */
  getStateMachine() {
    return this._stateMachine;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      ...this.stats,
      state: this._stateMachine.state,
      lastEventId: this.lastEventId,
      retryCount: this.retryCount,
      stateMachine: this._stateMachine.getStats(),
    };
  }

  /**
   * Check if connected
   */
  get connected() {
    return this._stateMachine.is(ConnectionState.OPEN);
  }

  /**
   * Check if stopped
   */
  get stopped() {
    return this._stopped;
  }

  /**
   * Enable/disable debug logging (SSRK-95)
   */
  setDebug(enabled) {
    this.options.debug = enabled;
    this._stateMachine.setDebug(enabled);
  }
}

/**
 * Factory function to create and connect
 * @param {string} url - SSE endpoint URL
 * @param {Object} options - Configuration options
 * @returns {SSEConnector}
 */
export function connectSSE(url, options = {}) {
  const connector = new SSEConnector(url, options);
  connector.connect();
  return connector;
}

// Re-export state machine types
export { ConnectionState, TransitionReason } from './state-machine.js';

export default SSEConnector;
