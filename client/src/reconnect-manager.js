/**
 * Reconnect Manager (US-09, US-10)
 * Handles automatic reconnection with retry limits and circuit breaker
 */
import { RetryPolicy, DEFAULT_RETRY_POLICY } from './retry-policy.js';
import { TransitionReason } from './state-machine.js';

/**
 * Disconnect reasons that should trigger reconnect
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
 * Disconnect reasons that should NOT trigger reconnect
 */
export const NON_RECONNECTABLE_REASONS = [
  TransitionReason.USER_STOP,
  TransitionReason.USER_RESTART,
  TransitionReason.RETRY_EXHAUSTED,
];

/**
 * Give up reasons (SSRK-108)
 */
export const GiveUpReason = {
  MAX_ATTEMPTS: 'max_attempts_reached',
  MAX_TIME: 'max_retry_time_exceeded',
  USER_STOP: 'user_stopped',
  INTENTIONAL: 'intentional_disconnect',
};

/**
 * Reconnect Manager Class
 */
export class ReconnectManager {
  /**
   * Create a reconnect manager
   * @param {Object} options - Configuration
   */
  constructor(options = {}) {
    // Retry policy
    this.policy = options.retryPolicy instanceof RetryPolicy
      ? options.retryPolicy
      : new RetryPolicy(options.retryPolicy || {});
    
    // Callbacks
    this.onRetry = options.onRetry || (() => {});
    this.onReconnect = options.onReconnect || (() => {});
    this.onGiveUp = options.onGiveUp || (() => {});  // SSRK-109
    
    // State (SSRK-105)
    this._attempt = 0;
    this._timer = null;
    this._isActive = false;
    this._lastReason = null;
    this._lastError = null;
    this._firstFailureTime = null;  // For time-based cap (SSRK-107)
    this._givenUp = false;          // SSRK-108
    this._giveUpReason = null;
    
    // Debug
    this._debug = options.debug || false;
  }

  /**
   * Check if a disconnect reason should trigger reconnect
   * @param {string} reason - Disconnect reason
   * @returns {boolean}
   */
  shouldReconnect(reason) {
    if (NON_RECONNECTABLE_REASONS.includes(reason)) {
      return false;
    }
    return RECONNECTABLE_REASONS.includes(reason);
  }

  /**
   * Get elapsed time since first failure (SSRK-107)
   * @returns {number} Elapsed milliseconds
   */
  getElapsedTime() {
    if (!this._firstFailureTime) return 0;
    return Date.now() - this._firstFailureTime;
  }

  /**
   * Start reconnection process
   * @param {string} reason - Disconnect reason
   * @param {Error|string} error - The error that caused disconnect
   * @returns {boolean} Whether reconnect was scheduled
   */
  scheduleReconnect(reason, error = null) {
    // Already given up (SSRK-108)
    if (this._givenUp) {
      if (this._debug) {
        console.log(`[RECONNECT] Already given up: ${this._giveUpReason}`);
      }
      return false;
    }

    // Check if we should reconnect for this reason (SSRK-100)
    if (!this.shouldReconnect(reason)) {
      if (this._debug) {
        console.log(`[RECONNECT] Not reconnecting: ${reason} (intentional)`);
      }
      this._giveUp(GiveUpReason.INTENTIONAL, reason, error);
      return false;
    }

    // Record first failure time for time-based cap (SSRK-107)
    if (!this._firstFailureTime) {
      this._firstFailureTime = Date.now();
    }

    // Check retry limits (SSRK-106, SSRK-107)
    const elapsedMs = this.getElapsedTime();
    const { shouldRetry, reason: stopReason } = this.policy.shouldRetry(this._attempt, elapsedMs);

    if (!shouldRetry) {
      if (this._debug) {
        console.log(`[RECONNECT] Giving up: ${stopReason} (attempts: ${this._attempt}, elapsed: ${elapsedMs}ms)`);
      }
      this._giveUp(stopReason, reason, error);
      return false;
    }

    // Calculate delay
    const delay = this.policy.getDelay(this._attempt);
    this._lastReason = reason;
    this._lastError = error;
    this._isActive = true;

    if (this._debug) {
      console.log(`[RECONNECT] Scheduling attempt ${this._attempt + 1} in ${delay}ms (reason: ${reason}, elapsed: ${elapsedMs}ms)`);
    }

    // Fire onRetry callback (SSRK-102)
    this.onRetry({
      attempt: this._attempt + 1,
      delayMs: delay,
      reason,
      error,
      elapsedMs,
      maxAttempts: this.policy.config.maxAttempts,
      maxRetryTimeMs: this.policy.config.maxRetryTimeMs,
    });

    // Schedule reconnect (SSRK-101)
    this._timer = setTimeout(() => {
      this._attempt++;  // SSRK-105: Increment attempt counter
      this._isActive = false;
      
      if (this._debug) {
        console.log(`[RECONNECT] Executing attempt ${this._attempt}`);
      }
      
      this.onReconnect({
        attempt: this._attempt,
        reason: this._lastReason,
        elapsedMs: this.getElapsedTime(),
      });
    }, delay);

    return true;
  }

  /**
   * Internal give up handler (SSRK-108, SSRK-109)
   */
  _giveUp(giveUpReason, disconnectReason, error) {
    this._givenUp = true;
    this._giveUpReason = giveUpReason;
    this._isActive = false;
    
    // Clear any pending timer (SSRK-110)
    this._clearTimer();

    // Fire onGiveUp callback (SSRK-109)
    this.onGiveUp({
      reason: giveUpReason,
      attempts: this._attempt,
      elapsedMs: this.getElapsedTime(),
      lastError: error || this._lastError,
      lastDisconnectReason: disconnectReason || this._lastReason,
    });
  }

  /**
   * Clear pending timer (SSRK-110)
   */
  _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /**
   * Cancel pending reconnect (SSRK-110)
   */
  cancel() {
    this._clearTimer();
    this._isActive = false;
  }

  /**
   * Stop all retries and enter give-up state (SSRK-108, SSRK-110)
   * Called when user manually stops
   */
  stop() {
    this.cancel();
    if (!this._givenUp) {
      this._givenUp = true;
      this._giveUpReason = GiveUpReason.USER_STOP;
    }
  }

  /**
   * Reset for fresh connection cycle (SSRK-105, SSRK-111)
   * Called after successful connection OR for manual restart
   */
  reset() {
    this.cancel();
    this._attempt = 0;
    this._firstFailureTime = null;
    this._lastReason = null;
    this._lastError = null;
    this._givenUp = false;
    this._giveUpReason = null;
  }

  /**
   * Manual restart after give-up (SSRK-111)
   * Resets state and allows new connection attempts
   */
  restart() {
    this.reset();
    if (this._debug) {
      console.log('[RECONNECT] Manual restart - state reset');
    }
  }

  /**
   * Get current attempt number (SSRK-105)
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
   * Check if given up (SSRK-108)
   */
  get hasGivenUp() {
    return this._givenUp;
  }

  /**
   * Get give up reason (SSRK-108)
   */
  get giveUpReason() {
    return this._giveUpReason;
  }

  /**
   * Get retry info for current state
   */
  getRetryInfo() {
    return this.policy.getRetryInfo(this._attempt, this.getElapsedTime());
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      attempt: this._attempt,
      isPending: this._isActive,
      hasGivenUp: this._givenUp,
      giveUpReason: this._giveUpReason,
      elapsedMs: this.getElapsedTime(),
      lastReason: this._lastReason,
      lastError: this._lastError,
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

export { GiveUpReason };
export default ReconnectManager;
