/**
 * SSE Client Connector (US-07, US-08, US-09, US-10)
 * With state machine, retry policy, and circuit breaker
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
import { RetryPolicy, DEFAULT_RETRY_POLICY } from './retry-policy.js';
import { ReconnectManager, RECONNECTABLE_REASONS, GiveUpReason } from './reconnect-manager.js';

/**
 * SSE Connector Class
 */
export class SSEConnector {
  /**
   * Create a new SSE connector
   * @param {string} url - SSE endpoint URL
   * @param {Object} options - Configuration options
   */
  constructor(url, options = {}) {
    this.url = new URL(url);
    
    // Build retry policy
    const retryPolicyConfig = options.retryPolicy || {
      baseDelayMs: options.retryInterval || DEFAULT_RETRY_POLICY.baseDelayMs,
      maxDelayMs: options.maxDelayMs || DEFAULT_RETRY_POLICY.maxDelayMs,
      maxAttempts: options.maxRetries ?? DEFAULT_RETRY_POLICY.maxAttempts,
      maxRetryTimeMs: options.maxRetryTimeMs ?? DEFAULT_RETRY_POLICY.maxRetryTimeMs,
      jitterPct: options.jitterPct ?? DEFAULT_RETRY_POLICY.jitterPct,
    };

    this.options = {
      // Timeouts
      timeout: options.timeout || Defaults.CLIENT_TIMEOUT_MS,
      
      // Auto-reconnect
      autoReconnect: options.autoReconnect !== false,
      
      // Headers
      headers: options.headers || {},
      
      // Lifecycle callbacks
      onOpen: options.onOpen || (() => {}),
      onEvent: options.onEvent || (() => {}),
      onError: options.onError || (() => {}),
      onClose: options.onClose || (() => {}),
      
      // State change callback
      onStateChange: options.onStateChange || null,
      
      // Retry callback
      onRetry: options.onRetry || null,
      
      // Give up callback (SSRK-109)
      onGiveUp: options.onGiveUp || null,
      
      // Reserved event handlers
      onHeartbeat: options.onHeartbeat || null,
      onControl: options.onControl || null,
      onSystemError: options.onSystemError || null,
      
      // Validation
      validateEnvelope: options.validateEnvelope !== false,
      
      // Debug logging
      debug: options.debug || false,
    };

    // State machine
    this._stateMachine = new StateMachine({
      debug: this.options.debug,
      onStateChange: (event) => this._handleStateChange(event),
    });

    // Reconnect manager
    this._reconnectManager = new ReconnectManager({
      retryPolicy: retryPolicyConfig,
      debug: this.options.debug,
      onRetry: (info) => this._handleRetryScheduled(info),
      onReconnect: (info) => this._handleReconnectAttempt(info),
      onGiveUp: (info) => this._handleGiveUp(info),
    });

    // Connection state
    this.lastEventId = null;
    this.request = null;
    this.response = null;
    this.timeoutTimer = null;
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
   * Handle state change events
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
   * Handle retry scheduled
   */
  _handleRetryScheduled(info) {
    if (this.options.debug) {
      console.log(`[CONNECTOR] Retry scheduled: attempt ${info.attempt} in ${info.delayMs}ms`);
    }

    if (this.options.onRetry) {
      this.options.onRetry({
        attempt: info.attempt,
        delayMs: info.delayMs,
        reason: info.reason,
        error: info.error,
        elapsedMs: info.elapsedMs,
        maxAttempts: info.maxAttempts,
        maxRetryTimeMs: info.maxRetryTimeMs,
      });
    }
  }

  /**
   * Handle reconnect attempt
   */
  _handleReconnectAttempt(info) {
    if (this._stopped) return;

    this.stats.reconnectCount++;
    
    // Transition: RETRYING → CONNECTING
    this._stateMachine.retrying();
    this._doConnect();
  }

  /**
   * Handle give up (SSRK-108, SSRK-109)
   */
  _handleGiveUp(info) {
    if (this.options.debug) {
      console.log(`[CONNECTOR] Gave up: ${info.reason} after ${info.attempts} attempts (${info.elapsedMs}ms)`);
    }

    // Transition to CLOSED (SSRK-108)
    this._stateMachine.close(TransitionReason.RETRY_EXHAUSTED);

    // Fire onGiveUp callback (SSRK-109)
    if (this.options.onGiveUp) {
      this.options.onGiveUp({
        reason: info.reason,
        attempts: info.attempts,
        elapsedMs: info.elapsedMs,
        lastError: info.lastError,
      });
    }

    // Also fire onClose for consistency
    this.options.onClose({
      reason: info.reason,
      attempts: info.attempts,
      elapsedMs: info.elapsedMs,
      willReconnect: false,
      state: this._stateMachine.state,
    });
  }

  /**
   * Connect to the SSE server
   * @returns {SSEConnector} this
   */
  connect() {
    // Handle restart after give-up (SSRK-111)
    if (this._stopped || this._reconnectManager.hasGivenUp) {
      this._stopped = false;
      this._stateMachine.reset();
      this._reconnectManager.restart();
    }

    if (this._stateMachine.is(ConnectionState.OPEN) || 
        this._stateMachine.is(ConnectionState.CONNECTING)) {
      return this;
    }

    if (this._stateMachine.is(ConnectionState.IDLE) || 
        this._stateMachine.is(ConnectionState.RETRYING)) {
      this._stateMachine.connect();
    }
    
    this._doConnect();
    return this;
  }

  /**
   * Restart after give-up (SSRK-111)
   * Alias for connect() with explicit reset
   */
  restart() {
    if (this.options.debug) {
      console.log('[CONNECTOR] Manual restart requested');
    }
    return this.connect();
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

    this.request.setTimeout(this.options.timeout);
  }

  /**
   * Handle HTTP response
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

    const contentType = res.headers['content-type'];
    if (!contentType || !contentType.includes('text/event-stream')) {
      this._handleError(
        new Error(`Invalid Content-Type: ${contentType}`),
        'content-type',
        TransitionReason.SERVER_ERROR
      );
      return;
    }

    // Connection successful - reset retry state (SSRK-105)
    this._reconnectManager.reset();
    
    this._stateMachine.connected();
    this.stats.connectedAt = Date.now();
    this._resetTimeout();

    this.options.onOpen({
      url: this.url.href,
      lastEventId: this.lastEventId,
      state: this._stateMachine.state,
      reconnectCount: this.stats.reconnectCount,
    });

    let buffer = '';
    
    res.on('data', (chunk) => {
      if (this._stopped) return;
      
      this._resetTimeout();
      this.stats.bytesReceived += chunk.length;
      
      buffer += chunk.toString();
      
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
        this._handleDisconnect(TransitionReason.SERVER_CLOSE);
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
    
    if (parsed.id) {
      this.lastEventId = parsed.id;
    }

    if (parsed.retry) {
      if (this.options.debug) {
        console.log(`[CONNECTOR] Server suggested retry: ${parsed.retry}ms`);
      }
    }

    if (!parsed.data) return;

    const { envelope, error } = decodeSSE(parsed.data);
    
    if (error) {
      this._handleParseError(error, raw);
      return;
    }

    if (this.options.validateEnvelope) {
      const validation = validateEvent(envelope);
      if (!validation.valid) {
        this._handleValidationError(validation.errors, envelope);
        return;
      }
    }

    this.stats.eventsReceived++;
    this._routeEvent(envelope);
  }

  /**
   * Route event to appropriate handler
   */
  _routeEvent(envelope) {
    const { type } = envelope;

    if (type === ReservedEventTypes.HEARTBEAT) {
      if (this.options.onHeartbeat) {
        this.options.onHeartbeat(envelope);
      }
      return;
    }

    if (type === ReservedEventTypes.ERROR) {
      if (this.options.onSystemError) {
        this.options.onSystemError(envelope);
      } else {
        this.options.onError({ type: 'system_error', envelope });
      }
      return;
    }

    if (type.startsWith('control.')) {
      if (this.options.onControl) {
        this.options.onControl(envelope);
      }
    }

    this.options.onEvent(envelope);
  }

  /**
   * Handle parse errors
   */
  _handleParseError(error, raw) {
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
   * Handle connection errors
   */
  _handleError(err, source, reason) {
    if (this._stopped) return;

    this.stats.disconnectedAt = Date.now();
    this._clearTimeout();
    this._cleanup();

    this._stateMachine.error(reason, { source, message: err.message });

    this.options.onError({
      type: 'connection_error',
      source,
      message: err.message,
      state: this._stateMachine.state,
    });

    this._attemptReconnect(reason, err);
  }

  /**
   * Handle disconnect
   */
  _handleDisconnect(reason) {
    if (this._stopped) return;

    this.stats.disconnectedAt = Date.now();
    this._clearTimeout();
    this._cleanup();

    this._stateMachine.error(reason);

    this._attemptReconnect(reason);
  }

  /**
   * Attempt reconnection
   */
  _attemptReconnect(reason, error = null) {
    if (this._stopped || !this.options.autoReconnect) {
      this._stateMachine.close(reason);
      this.options.onClose({
        reason,
        willReconnect: false,
        state: this._stateMachine.state,
      });
      return;
    }

    const willReconnect = this._reconnectManager.scheduleReconnect(reason, error);
    
    if (willReconnect) {
      this._stateMachine.retry();
      
      const retryInfo = this._reconnectManager.getRetryInfo();
      this.options.onClose({
        reason,
        willReconnect: true,
        retryIn: retryInfo.delay,
        attempt: this._reconnectManager.attempt + 1,
        elapsedMs: this._reconnectManager.getElapsedTime(),
        state: this._stateMachine.state,
      });
    }
    // If willReconnect is false, _handleGiveUp already fired
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
   * Cleanup connection resources (SSRK-110)
   */
  _cleanup() {
    if (this.response) {
      this.response.removeAllListeners();
      this.response = null;
    }
  }

  /**
   * Stop and disconnect (SSRK-110)
   * Clears all timers and prevents further reconnects
   */
  stop() {
    this._stopped = true;
    this._clearTimeout();
    this._reconnectManager.stop();

    if (this.request) {
      this.request.destroy();
      this.request = null;
    }

    this._cleanup();
    this._stateMachine.forceClose(TransitionReason.USER_STOP);
    this.stats.disconnectedAt = Date.now();
  }

  /**
   * Alias for stop()
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
   * Get state machine instance
   */
  getStateMachine() {
    return this._stateMachine;
  }

  /**
   * Get reconnect manager instance
   */
  getReconnectManager() {
    return this._reconnectManager;
  }

  /**
   * Get retry policy
   */
  getRetryPolicy() {
    return this._reconnectManager.policy;
  }

  /**
   * Check if given up (SSRK-108)
   */
  get hasGivenUp() {
    return this._reconnectManager.hasGivenUp;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      ...this.stats,
      state: this._stateMachine.state,
      lastEventId: this.lastEventId,
      retryAttempt: this._reconnectManager.attempt,
      hasGivenUp: this._reconnectManager.hasGivenUp,
      giveUpReason: this._reconnectManager.giveUpReason,
      stateMachine: this._stateMachine.getStats(),
      reconnect: this._reconnectManager.getStats(),
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
   * Enable/disable debug logging
   */
  setDebug(enabled) {
    this.options.debug = enabled;
    this._stateMachine.setDebug(enabled);
    this._reconnectManager.setDebug(enabled);
  }
}

/**
 * Factory function to create and connect
 */
export function connectSSE(url, options = {}) {
  const connector = new SSEConnector(url, options);
  connector.connect();
  return connector;
}

// Re-export types
export { ConnectionState, TransitionReason } from './state-machine.js';
export { RetryPolicy, RetryPolicies, DEFAULT_RETRY_POLICY } from './retry-policy.js';
export { ReconnectManager, RECONNECTABLE_REASONS, GiveUpReason } from './reconnect-manager.js';

export default SSEConnector;
