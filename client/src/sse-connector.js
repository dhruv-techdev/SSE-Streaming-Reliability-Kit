/**
 * SSE Client Connector (US-07)
 * Reusable entrypoint to connect to SSE server with lifecycle callbacks
 */
import http from 'http';
import https from 'https';
import {
  parseSSEChunk,
  decodeSSE,
  validateEvent,
  ClientState,
  Defaults,
  ReservedEventTypes,
} from '../../shared/src/index.js';

/**
 * SSE Connector Class
 * Provides a reusable client with lifecycle callbacks
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
      
      // Callbacks (ST-02)
      onOpen: options.onOpen || (() => {}),
      onEvent: options.onEvent || (() => {}),
      onError: options.onError || (() => {}),
      onClose: options.onClose || (() => {}),
      
      // Reserved event handlers (ST-05)
      onHeartbeat: options.onHeartbeat || null,
      onControl: options.onControl || null,
      onSystemError: options.onSystemError || null,
      
      // Validation
      validateEnvelope: options.validateEnvelope !== false,
    };

    // State
    this.state = ClientState.CLOSED;
    this.lastEventId = null;
    this.retryCount = 0;
    this.request = null;
    this.timeoutTimer = null;
    this.retryTimer = null;
    
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
   * Connect to the SSE server (ST-01)
   * @returns {SSEConnector} this
   */
  connect() {
    if (this.state === ClientState.OPEN || this.state === ClientState.CONNECTING) {
      return this;
    }

    this._setState(ClientState.CONNECTING);
    this._doConnect();
    return this;
  }

  /**
   * Internal connect logic
   */
  _doConnect() {
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
      this._handleResponse(res);
    });

    this.request.on('error', (err) => {
      this._handleError(err, 'request');
    });

    this.request.on('timeout', () => {
      this._handleError(new Error('Request timeout'), 'timeout');
    });

    // Set request timeout
    this.request.setTimeout(this.options.timeout);
  }

  /**
   * Handle HTTP response
   */
  _handleResponse(res) {
    if (res.statusCode !== 200) {
      this._handleError(
        new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`),
        'http'
      );
      return;
    }

    // Verify content type
    const contentType = res.headers['content-type'];
    if (!contentType || !contentType.includes('text/event-stream')) {
      this._handleError(
        new Error(`Invalid Content-Type: ${contentType}`),
        'content-type'
      );
      return;
    }

    // Connection established
    this._setState(ClientState.OPEN);
    this.retryCount = 0;
    this.stats.connectedAt = Date.now();
    this._resetTimeout();

    // Notify onOpen callback
    this.options.onOpen({
      url: this.url.href,
      lastEventId: this.lastEventId,
    });

    // Handle incoming data
    let buffer = '';
    
    res.on('data', (chunk) => {
      this._resetTimeout();
      this.stats.bytesReceived += chunk.length;
      
      buffer += chunk.toString();
      
      // Process complete events (separated by \n\n)
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || ''; // Keep incomplete part
      
      for (const part of parts) {
        if (part.trim()) {
          this._processEvent(part + '\n\n');
        }
      }
    });

    res.on('end', () => {
      this._handleClose('stream_ended');
    });

    res.on('error', (err) => {
      this._handleError(err, 'response');
    });
  }

  /**
   * Process a single SSE event (ST-03)
   */
  _processEvent(raw) {
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
      return; // Comment or empty event
    }

    const { envelope, error } = decodeSSE(parsed.data);
    
    if (error) {
      this._handleParseError(error, raw);
      return;
    }

    // Validate envelope (ST-04)
    if (this.options.validateEnvelope) {
      const validation = validateEvent(envelope);
      if (!validation.valid) {
        this._handleValidationError(validation.errors, envelope);
        return;
      }
    }

    this.stats.eventsReceived++;

    // Route event by type (ST-05)
    this._routeEvent(envelope);
  }

  /**
   * Route event to appropriate handler (ST-05)
   */
  _routeEvent(envelope) {
    const { type } = envelope;

    // System heartbeat
    if (type === ReservedEventTypes.HEARTBEAT) {
      if (this.options.onHeartbeat) {
        this.options.onHeartbeat(envelope);
      }
      // Heartbeats don't go to onEvent by default
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
      // Control events also go to onEvent
    }

    // All domain events and control events go to onEvent
    this.options.onEvent(envelope);
  }

  /**
   * Handle parse errors (ST-03)
   */
  _handleParseError(error, raw) {
    this.options.onError({
      type: 'parse_error',
      message: error,
      raw: raw.slice(0, 200), // Truncate for safety
    });
  }

  /**
   * Handle validation errors (ST-04)
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
   * Handle connection errors
   */
  _handleError(err, source) {
    this.stats.disconnectedAt = Date.now();
    this._clearTimeout();

    if (this.state === ClientState.CLOSED) {
      return; // Already closed, ignore
    }

    this.options.onError({
      type: 'connection_error',
      source,
      message: err.message,
    });

    if (this.options.autoReconnect && this.retryCount < this.options.maxRetries) {
      this._scheduleReconnect();
    } else {
      this._setState(ClientState.CLOSED);
      this.options.onClose({
        reason: 'error',
        error: err.message,
        willReconnect: false,
      });
    }
  }

  /**
   * Handle connection close
   */
  _handleClose(reason) {
    this.stats.disconnectedAt = Date.now();
    this._clearTimeout();

    if (this.state === ClientState.CLOSED) {
      return;
    }

    if (this.options.autoReconnect && this.retryCount < this.options.maxRetries) {
      this.options.onClose({
        reason,
        willReconnect: true,
        retryIn: this.options.retryInterval,
      });
      this._scheduleReconnect();
    } else {
      this._setState(ClientState.CLOSED);
      this.options.onClose({
        reason,
        willReconnect: false,
      });
    }
  }

  /**
   * Schedule reconnection attempt
   */
  _scheduleReconnect() {
    this._setState(ClientState.RETRYING);
    this.retryCount++;
    this.stats.reconnectCount++;

    this.retryTimer = setTimeout(() => {
      this._doConnect();
    }, this.options.retryInterval);
  }

  /**
   * Reset the timeout timer
   */
  _resetTimeout() {
    this._clearTimeout();
    this.timeoutTimer = setTimeout(() => {
      this._handleError(new Error('Connection timeout - no data received'), 'timeout');
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
   * Set connection state
   */
  _setState(newState) {
    this.state = newState;
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    this._clearTimeout();
    
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.request) {
      this.request.destroy();
      this.request = null;
    }

    this._setState(ClientState.CLOSED);
    this.stats.disconnectedAt = Date.now();
  }

  /**
   * Get current connection state
   */
  getState() {
    return this.state;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      ...this.stats,
      state: this.state,
      lastEventId: this.lastEventId,
      retryCount: this.retryCount,
    };
  }

  /**
   * Check if connected
   */
  get connected() {
    return this.state === ClientState.OPEN;
  }
}

/**
 * Factory function to create and connect (ST-01)
 * @param {string} url - SSE endpoint URL
 * @param {Object} options - Configuration options
 * @returns {SSEConnector}
 */
export function connectSSE(url, options = {}) {
  const connector = new SSEConnector(url, options);
  connector.connect();
  return connector;
}

export default SSEConnector;
