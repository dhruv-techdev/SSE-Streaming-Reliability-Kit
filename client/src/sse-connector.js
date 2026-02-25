/**
 * SSE Client Connector (US-07 through US-15)
 * With state machine, retry policy, liveness detection, Last-Event-ID resume,
 * and cannot-resume fallback handling
 */
import http from 'http';
import https from 'https';
import {
  parseSSEChunk,
  decodeSSE,
  validateEvent,
  Defaults,
  ReservedEventTypes,
  DisconnectReason,
  CannotResumeReason,
} from '../../shared/src/index.js';
import {
  StateMachine,
  ConnectionState,
  TransitionReason,
} from './state-machine.js';
import { RetryPolicy, DEFAULT_RETRY_POLICY } from './retry-policy.js';
import { ReconnectManager, RECONNECTABLE_REASONS, GiveUpReason } from './reconnect-manager.js';
import { LivenessMonitor, createLivenessMonitor } from './liveness-monitor.js';
import { EventIdStore, createEventIdStore, MemoryStorage } from './event-id-store.js';

/**
 * Fallback behavior options (SSRK-143)
 */
export const CannotResumeFallback = {
  // Reconnect without Last-Event-ID (fresh stream)
  START_FRESH: 'start_fresh',
  // Close connection and don't reconnect
  CLOSE: 'close',
  // Let the application decide via callback
  CALLBACK: 'callback',
};

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
      
      // Liveness detection
      livenessTimeoutMs: options.livenessTimeoutMs || Defaults.LIVENESS_TIMEOUT_MS,
      livenessGracePeriodMs: options.livenessGracePeriodMs || Defaults.LIVENESS_GRACE_PERIOD_MS,
      enableLivenessCheck: options.enableLivenessCheck !== false,
      
      // Last-Event-ID persistence
      persistLastEventId: options.persistLastEventId || false,
      eventIdStorage: options.eventIdStorage || null,
      streamId: options.streamId || 'default',
      
      // Cannot-resume fallback behavior (SSRK-143)
      cannotResumeFallback: options.cannotResumeFallback || CannotResumeFallback.START_FRESH,
      
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
      
      // Give up callback
      onGiveUp: options.onGiveUp || null,
      
      // Liveness failure callback
      onLivenessFailure: options.onLivenessFailure || null,
      
      // Resume attempt callback
      onResumeAttempt: options.onResumeAttempt || null,
      
      // Cannot resume callback (SSRK-142)
      onCannotResume: options.onCannotResume || null,
      
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

    // Liveness monitor
    this._livenessMonitor = createLivenessMonitor({
      timeoutMs: this.options.livenessTimeoutMs,
      gracePeriodMs: this.options.livenessGracePeriodMs,
      debug: this.options.debug,
      onLivenessFailure: (info) => this._handleLivenessFailure(info),
    });

    // Event ID store for Last-Event-ID tracking
    this._eventIdStore = createEventIdStore({
      streamId: this.options.streamId,
      storage: this.options.eventIdStorage || new MemoryStorage(),
      persist: this.options.persistLastEventId,
      debug: this.options.debug,
    });

    // Connection state
    this.request = null;
    this.response = null;
    this.timeoutTimer = null;
    this._stopped = false;
    this._startFreshOnNextConnect = false;
    
    // Stats (SSRK-144)
    this.stats = {
      eventsReceived: 0,
      bytesReceived: 0,
      connectedAt: null,
      disconnectedAt: null,
      reconnectCount: 0,
      livenessFailures: 0,
      resumeAttempts: 0,
      cannotResumeCount: 0,
    };
  }

  /**
   * Get current lastEventId
   */
  get lastEventId() {
    return this._eventIdStore.get();
  }

  /**
   * Set lastEventId (for external initialization)
   */
  set lastEventId(value) {
    this._eventIdStore.set(value);
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
    
    this._stateMachine.retrying();
    this._doConnect();
  }

  /**
   * Handle give up
   */
  _handleGiveUp(info) {
    if (this.options.debug) {
      console.log(`[CONNECTOR] Gave up: ${info.reason} after ${info.attempts} attempts (${info.elapsedMs}ms)`);
    }

    this._livenessMonitor.stop();

    this._stateMachine.close(TransitionReason.RETRY_EXHAUSTED);

    if (this.options.onGiveUp) {
      this.options.onGiveUp({
        reason: info.reason,
        attempts: info.attempts,
        elapsedMs: info.elapsedMs,
        lastError: info.lastError,
      });
    }

    this.options.onClose({
      reason: info.reason,
      attempts: info.attempts,
      elapsedMs: info.elapsedMs,
      willReconnect: false,
      state: this._stateMachine.state,
    });
  }

  /**
   * Handle liveness failure
   */
  _handleLivenessFailure(info) {
    if (this._stopped) return;
    
    this.stats.livenessFailures++;
    
    if (this.options.debug) {
      console.log(`[CONNECTOR] Liveness failure: ${info.reason} (${info.elapsedMs}ms since last heartbeat)`);
    }

    if (this.options.onLivenessFailure) {
      this.options.onLivenessFailure({
        lastHeartbeatAt: info.lastHeartbeatAt,
        elapsedMs: info.elapsedMs,
        timeoutMs: info.timeoutMs,
      });
    }

    this._handleDisconnect(DisconnectReason.HEARTBEAT_MISSED);
  }

  /**
   * Handle cannot-resume signal from server (SSRK-142)
   */
  _handleCannotResume(envelope) {
    this.stats.cannotResumeCount++;
    
    const { code, reason, requestedId, action } = envelope.payload;
    
    if (this.options.debug) {
      console.log(`[CONNECTOR] Cannot resume: ${code} - ${reason}`);
    }

    // Handle fallback behavior before callback so callback sees updated state (SSRK-143)
    const fallback = this.options.cannotResumeFallback;

    if (fallback === CannotResumeFallback.START_FRESH) {
      // Clear lastEventId before callback so callback observes cleared state
      this._eventIdStore.clear();

      if (this.options.debug) {
        console.log(`[CONNECTOR] Fallback: start_fresh - cleared lastEventId`);
      }
    }

    // Fire callback (SSRK-142)
    if (this.options.onCannotResume) {
      this.options.onCannotResume({
        lastEventId: requestedId,
        reason: code || reason,
        serverSuggestedAction: action,
        payload: envelope.payload,
      });
    }

    if (fallback === CannotResumeFallback.CLOSE) {
      // Close connection
      if (this.options.debug) {
        console.log(`[CONNECTOR] Fallback: close - stopping connection`);
      }
      this.stop();
    }
    // CALLBACK fallback - let the onCannotResume handler decide
  }

  /**
   * Connect to the SSE server
   * @returns {SSEConnector} this
   */
  connect() {
    if (this._stopped || this._reconnectManager.hasGivenUp) {
      this._stopped = false;
      this._stateMachine.reset();
      this._reconnectManager.restart();
      this._livenessMonitor.reset();
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
   * Restart after give-up
   */
  restart() {
    if (this.options.debug) {
      console.log('[CONNECTOR] Manual restart requested');
    }
    return this.connect();
  }

  /**
   * Start fresh - clear lastEventId and connect (SSRK-143)
   */
  startFresh() {
    if (this.options.debug) {
      console.log('[CONNECTOR] Starting fresh (clearing lastEventId)');
    }
    this._eventIdStore.clear();
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

    // Attach Last-Event-ID header on connect/reconnect
    // Skip if _startFreshOnNextConnect is set (SSRK-143)
    const lastEventId = this._startFreshOnNextConnect ? null : this._eventIdStore.get();
    this._startFreshOnNextConnect = false;
    
    if (lastEventId) {
      requestOptions.headers['Last-Event-ID'] = lastEventId;
      this.stats.resumeAttempts++;
      
      if (this.options.debug) {
        console.log(`[CONNECTOR] Attaching Last-Event-ID: ${lastEventId}`);
      }
      
      // Fire resume attempt callback
      if (this.options.onResumeAttempt) {
        this.options.onResumeAttempt({
          lastEventId,
          attempt: this.stats.resumeAttempts,
          reconnectCount: this.stats.reconnectCount,
        });
      }
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

    // Connection successful - reset retry state
    this._reconnectManager.reset();
    
    this._stateMachine.connected();
    this.stats.connectedAt = Date.now();
    this._resetTimeout();

    // Start liveness monitor
    if (this.options.enableLivenessCheck) {
      this._livenessMonitor.reset();
      this._livenessMonitor.start();
    }

    this.options.onOpen({
      url: this.url.href,
      lastEventId: this._eventIdStore.get(),
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
    
    // Update lastEventId from SSE id field
    if (parsed.id) {
      this._eventIdStore.set(parsed.id);
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
    
    // Record event for liveness
    this._livenessMonitor.recordEvent();
    
    // Update lastEventId from envelope
    this._eventIdStore.updateFromEvent(envelope);
    
    this._routeEvent(envelope);
  }

  /**
   * Route event to appropriate handler
   */
  _routeEvent(envelope) {
    const { type } = envelope;

    // Heartbeat
    if (type === ReservedEventTypes.HEARTBEAT) {
      this._livenessMonitor.recordHeartbeat();
      
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

    // Handle cannot_resume control event (SSRK-142)
    if (type === 'control.cannot_resume') {
      this._handleCannotResume(envelope);
      // Still pass to onControl if set
      if (this.options.onControl) {
        this.options.onControl(envelope);
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

    this._livenessMonitor.stop();

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

    this._livenessMonitor.stop();

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
        lastEventId: this._eventIdStore.get(),
      });
    }
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
   * Stop and disconnect
   */
  stop() {
    this._stopped = true;
    this._clearTimeout();
    this._reconnectManager.stop();
    this._livenessMonitor.stop();

    if (this.request) {
      this.request.destroy();
      this.request = null;
    }

    this._cleanup();
    this._stateMachine.forceClose(TransitionReason.USER_STOP);
    this.stats.disconnectedAt = Date.now();
  }

  /**
   * Clear stored lastEventId
   */
  clearLastEventId() {
    this._eventIdStore.clear();
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
   * Get liveness monitor instance
   */
  getLivenessMonitor() {
    return this._livenessMonitor;
  }

  /**
   * Get event ID store instance
   */
  getEventIdStore() {
    return this._eventIdStore;
  }

  /**
   * Check if given up
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
      lastEventId: this._eventIdStore.get(),
      retryAttempt: this._reconnectManager.attempt,
      hasGivenUp: this._reconnectManager.hasGivenUp,
      giveUpReason: this._reconnectManager.giveUpReason,
      stateMachine: this._stateMachine.getStats(),
      reconnect: this._reconnectManager.getStats(),
      liveness: this._livenessMonitor.getStats(),
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
    this._livenessMonitor.setDebug(enabled);
    this._eventIdStore.setDebug(enabled);
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
export { LivenessMonitor, createLivenessMonitor } from './liveness-monitor.js';
export { EventIdStore, createEventIdStore, MemoryStorage, FileStorage, LocalStorageAdapter } from './event-id-store.js';
export { CannotResumeFallback };

export default SSEConnector;
