/**
 * Reconnect Manager (US-09)
 * Handles automatic reconnection with retry policy
 */
import { RetryPolicy, DEFAULT_RETRY_POLICY } from './retry-policy.js';
import { TransitionReason } from './state-machine.js';

/**
 * Disconnect reasons that should trigger reconnect (SSRK-100)
 */
export const RECONNECTABLE_REASONS = [
  TransitionReason.CONNECTION_ERROR,
  TransitionReason.CONNECTION_TIMEOUT,
  TransitionReason.SERVER_CLOSE,
  TransitionReason.SERVER_ERROR,
  TransitionReason.NETWORK_ERROR,
  TransitionReason.PARSE_ERROR,
];

/**
 * Disconnect reasons that should NOT trigger reconnect (SSRK-100)
 */
export const NON_RECONNECTABLE_REASONS = [
  TransitionReason.USER_STOP,
  TransitionReason.USER_RESTART,
  TransitionReason.RETRY_EXHAUSTED,
];

/**
 * Reconnect Manager Class
 */
export class ReconnectManager {
  /**
   * Create a reconnect manager
   * @param {Object} options - Configuration
   */
  constructor(options = {}) {
    // Retry policy (SSRK-97)
    this.policy = options.retryPolicy instanceof RetryPolicy
      ? options.retryPolicy
      : new RetryPolicy(options.retryPolicy || {});
    
    // Callbacks
    this.onRetry = options.onRetry || (() => {});
    this.onReconnect = options.onReconnect || (() => {});
    this.onGiveUp = options.onGiveUp || (() => {});
    
    // State
    this._attempt = 0;
    this._timer = null;
    this._isActive = false;
    this._lastReason = null;
    
    // Debug
    this._debug = options.debug || false;
  }

  /**
   * Check if a disconnect reason should trigger reconnect (SSRK-100)
   * @param {string} reason - Disconnect reason
   * @returns {boolean}
   */
  shouldReconnect(reason) {
    // Never reconnect on intentional stops
    if (NON_RECONNECTABLE_REASONS.includes(reason)) {
      return false;
    }
    
    // Reconnect on unexpected disconnects
    return RECONNECTABLE_REASONS.includes(reason);
  }

  /**
   * Start reconnection process (SSRK-101)
   * @param {string} reason - Disconnect reason
   * @returns {boolean} Whether reconnect was scheduled
   */
  scheduleReconnect(reason) {
    // Check if we should reconnect (SSRK-100)
    if (!this.shouldReconnect(reason)) {
      if (this._debug) {
        console.log(`[RECONNECT] Not reconnecting: ${reason} (intentional)`);
      }
      return false;
    }

    // Check if retries are exhausted
    if (!this.policy.shouldRetry(this._attempt)) {
      if (this._debug) {
        console.log(`[RECONNECT] Giving up after ${this._attempt} attempts`);
      }
      this.onGiveUp({
        attempts: this._attempt,
        reason: 'max_attempts_reached',
        lastDisconnectReason: reason,
      });
      return false;
    }

    // Calculate delay with backoff + jitter (SSRK-98, SSRK-99)
    const delay = this.policy.getDelay(this._attempt);
    this._lastReason = reason;
    this._isActive = true;

    if (this._debug) {
      console.log(`[RECONNECT] Scheduling attempt ${this._attempt + 1} in ${delay}ms (reason: ${reason})`);
    }

    // Fire onRetry callback (SSRK-102)
    this.onRetry({
      attempt: this._attempt + 1,
      delayMs: delay,
      reason,
      maxAttempts: this.policy.config.maxAttempts,
    });

    // Schedule reconnect (SSRK-101)
    this._timer = setTimeout(() => {
      this._attempt++;
      this._isActive = false;
      
      if (this._debug) {
        console.log(`[RECONNECT] Executing attempt ${this._attempt}`);
      }
      
      this.onReconnect({
        attempt: this._attempt,
        reason: this._lastReason,
      });
    }, delay);

    return true;
  }

  /**
   * Cancel pending reconnect
   */
  cancel() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._isActive = false;
  }

  /**
   * Reset attempt counter (call after successful connection)
   */
  reset() {
    this.cancel();
    this._attempt = 0;
    this._lastReason = null;
  }

  /**
   * Get current attempt number
   */
  get attempt() {
    return this._attempt;
  }

  /**
   * Check if reconnect is pending
   */
  get isPending() {
    return this._isActive;
  }

  /**
   * Get retry info for current attempt
   */
  getRetryInfo() {
    return this.policy.getRetryInfo(this._attempt);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      attempt: this._attempt,
      isPending: this._isActive,
      lastReason: this._lastReason,
      policyConfig: this.policy.getConfig(),
    };
  }

  /**
   * Enable/disable debug logging
   */
  setDebug(enabled) {
    this._debug = enabled;
  }
}

/**
 * Create a reconnect manager
 */
export function createReconnectManager(options) {
  return new ReconnectManager(options);
}

export default ReconnectManager;
