/**
 * Reconnect Manager (US-09, US-10, US-12)
 * Handles automatic reconnection with retry limits and circuit breaker
 */
import { RetryPolicy, DEFAULT_RETRY_POLICY } from './retry-policy.js';
import { TransitionReason } from './state-machine.js';
import { DisconnectReason } from '../../shared/src/index.js';

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
  // Liveness failures should trigger reconnect (SSRK-123)
  DisconnectReason.HEARTBEAT_MISSED,
  DisconnectReason.LIVENESS_TIMEOUT,
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
 * Give up reasons
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
    this.policy = options.retryPolicy instanceof RetryPolicy
      ? options.retryPolicy
      : new RetryPolicy(options.retryPolicy || {});
    
    this.onRetry = options.onRetry || (() => {});
    this.onReconnect = options.onReconnect || (() => {});
    this.onGiveUp = options.onGiveUp || (() => {});
    
    this._attempt = 0;
    this._timer = null;
    this._isActive = false;
    this._lastReason = null;
    this._lastError = null;
    this._firstFailureTime = null;
    this._givenUp = false;
    this._giveUpReason = null;
    
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
   * Get elapsed time since first failure
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
    if (this._givenUp) {
      if (this._debug) {
        console.log(`[RECONNECT] Already given up: ${this._giveUpReason}`);
      }
      return false;
    }

    if (!this.shouldReconnect(reason)) {
      if (this._debug) {
        console.log(`[RECONNECT] Not reconnecting: ${reason} (intentional)`);
      }
      this._giveUp(GiveUpReason.INTENTIONAL, reason, error);
      return false;
    }

    if (!this._firstFailureTime) {
      this._firstFailureTime = Date.now();
    }

    const elapsedMs = this.getElapsedTime();
    const { shouldRetry, reason: stopReason } = this.policy.shouldRetry(this._attempt, elapsedMs);

    if (!shouldRetry) {
      if (this._debug) {
        console.log(`[RECONNECT] Giving up: ${stopReason} (attempts: ${this._attempt}, elapsed: ${elapsedMs}ms)`);
      }
      this._giveUp(stopReason, reason, error);
      return false;
    }

    const delay = this.policy.getDelay(this._attempt);
    this._lastReason = reason;
    this._lastError = error;
    this._isActive = true;

    if (this._debug) {
      console.log(`[RECONNECT] Scheduling attempt ${this._attempt + 1} in ${delay}ms (reason: ${reason}, elapsed: ${elapsedMs}ms)`);
    }

    this.onRetry({
      attempt: this._attempt + 1,
      delayMs: delay,
      reason,
      error,
      elapsedMs,
      maxAttempts: this.policy.config.maxAttempts,
      maxRetryTimeMs: this.policy.config.maxRetryTimeMs,
    });

    this._timer = setTimeout(() => {
      this._attempt++;
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
   * Internal give up handler
   */
  _giveUp(giveUpReason, disconnectReason, error) {
    this._givenUp = true;
    this._giveUpReason = giveUpReason;
    this._isActive = false;
    
    this._clearTimer();

    this.onGiveUp({
      reason: giveUpReason,
      attempts: this._attempt,
      elapsedMs: this.getElapsedTime(),
      lastError: error || this._lastError,
      lastDisconnectReason: disconnectReason || this._lastReason,
    });
  }

  /**
   * Clear pending timer
   */
  _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /**
   * Cancel pending reconnect
   */
  cancel() {
    this._clearTimer();
    this._isActive = false;
  }

  /**
   * Stop all retries and enter give-up state
   */
  stop() {
    this.cancel();
    if (!this._givenUp) {
      this._givenUp = true;
      this._giveUpReason = GiveUpReason.USER_STOP;
    }
  }

  /**
   * Reset for fresh connection cycle
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
   * Manual restart after give-up
   */
  restart() {
    this.reset();
    if (this._debug) {
      console.log('[RECONNECT] Manual restart - state reset');
    }
  }

  get attempt() {
    return this._attempt;
  }

  get isPending() {
    return this._isActive;
  }

  get hasGivenUp() {
    return this._givenUp;
  }

  get giveUpReason() {
    return this._giveUpReason;
  }

  getRetryInfo() {
    return this.policy.getRetryInfo(this._attempt, this.getElapsedTime());
  }

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
