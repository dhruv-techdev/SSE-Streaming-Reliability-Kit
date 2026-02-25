/**
 * Liveness Monitor (US-12)
 * Detects missed heartbeats and triggers recovery
 */
import { Defaults, DisconnectReason } from '../../shared/src/index.js';

/**
 * Liveness Monitor Class
 * Tracks heartbeats and detects "connection looks open but is dead" scenarios
 */
export class LivenessMonitor {
  /**
   * Create a liveness monitor
   * @param {Object} options - Configuration
   */
  constructor(options = {}) {
    // Configuration (SSRK-121)
    this.timeoutMs = options.timeoutMs || Defaults.LIVENESS_TIMEOUT_MS;
    this.gracePeriodMs = options.gracePeriodMs || Defaults.LIVENESS_GRACE_PERIOD_MS;
    this.checkIntervalMs = options.checkIntervalMs || Math.floor(this.timeoutMs / 3);
    
    // Callbacks (SSRK-125, SSRK-126)
    this.onLivenessFailure = options.onLivenessFailure || null;
    this.onLivenessRestored = options.onLivenessRestored || null;
    
    // Debug
    this._debug = options.debug || false;
    
    // State (SSRK-120)
    this._lastHeartbeatAt = null;
    this._lastEventAt = null;
    this._startedAt = null;
    this._firstHeartbeatReceived = false;
    this._checkTimer = null;
    this._isRunning = false;
    this._hasFailed = false;
    
    // Stats
    this._stats = {
      heartbeatsReceived: 0,
      eventsReceived: 0,
      failureCount: 0,
      lastFailureAt: null,
    };
  }

  /**
   * Start the liveness monitor (SSRK-122)
   * Should be called when connection is opened
   */
  start() {
    if (this._isRunning) return this;
    
    this._isRunning = true;
    this._startedAt = Date.now();
    this._hasFailed = false;
    this._firstHeartbeatReceived = false;
    
    // Start periodic check (SSRK-122)
    this._scheduleCheck();
    
    if (this._debug) {
      console.log(`[LIVENESS] Started (timeout: ${this.timeoutMs}ms, grace: ${this.gracePeriodMs}ms)`);
    }
    
    return this;
  }

  /**
   * Schedule next liveness check
   */
  _scheduleCheck() {
    if (!this._isRunning) return;
    
    this._checkTimer = setTimeout(() => {
      this._performCheck();
    }, this.checkIntervalMs);
  }

  /**
   * Perform liveness check (SSRK-122, SSRK-123, SSRK-124)
   */
  _performCheck() {
    if (!this._isRunning) return;
    
    const now = Date.now();
    const elapsed = now - this._startedAt;
    
    // Grace period check (SSRK-124)
    // Don't check liveness until after grace period AND first heartbeat
    if (elapsed < this.gracePeriodMs) {
      if (this._debug) {
        console.log(`[LIVENESS] In grace period (${elapsed}ms < ${this.gracePeriodMs}ms)`);
      }
      this._scheduleCheck();
      return;
    }
    
    // Wait for first heartbeat before enforcing timeout (SSRK-124)
    if (!this._firstHeartbeatReceived) {
      if (this._debug) {
        console.log(`[LIVENESS] Waiting for first heartbeat`);
      }
      this._scheduleCheck();
      return;
    }
    
    // Check if heartbeat is missed (SSRK-123)
    const timeSinceLastHeartbeat = now - this._lastHeartbeatAt;
    
    if (timeSinceLastHeartbeat > this.timeoutMs) {
      this._triggerFailure(timeSinceLastHeartbeat);
    } else {
      // All good, schedule next check
      if (this._debug) {
        console.log(`[LIVENESS] OK (last heartbeat: ${timeSinceLastHeartbeat}ms ago)`);
      }
      this._scheduleCheck();
    }
  }

  /**
   * Trigger liveness failure (SSRK-123, SSRK-125)
   */
  _triggerFailure(timeSinceLastHeartbeat) {
    if (this._hasFailed) return; // Already failed, don't trigger twice
    
    this._hasFailed = true;
    this._stats.failureCount++;
    this._stats.lastFailureAt = Date.now();
    
    if (this._debug) {
      console.log(`[LIVENESS] FAILURE - heartbeat missed (${timeSinceLastHeartbeat}ms > ${this.timeoutMs}ms)`);
    }
    
    // Stop checking - we're going to trigger reconnect
    this.stop();
    
    // Fire callback (SSRK-125)
    if (this.onLivenessFailure) {
      this.onLivenessFailure({
        reason: DisconnectReason.HEARTBEAT_MISSED,
        lastHeartbeatAt: this._lastHeartbeatAt,
        elapsedMs: timeSinceLastHeartbeat,
        timeoutMs: this.timeoutMs,
      });
    }
  }

  /**
   * Record heartbeat received (SSRK-120)
   * Called by connector when system.heartbeat event is received
   */
  recordHeartbeat() {
    const now = Date.now();
    this._lastHeartbeatAt = now;
    this._lastEventAt = now;
    this._stats.heartbeatsReceived++;
    
    // Mark first heartbeat (SSRK-124)
    if (!this._firstHeartbeatReceived) {
      this._firstHeartbeatReceived = true;
      if (this._debug) {
        console.log(`[LIVENESS] First heartbeat received - liveness checks now active`);
      }
    }
    
    // Reset failure state if we were in failed state
    if (this._hasFailed) {
      this._hasFailed = false;
      if (this.onLivenessRestored) {
        this.onLivenessRestored({
          heartbeatsReceived: this._stats.heartbeatsReceived,
        });
      }
    }
  }

  /**
   * Record any event received
   * Can be used as secondary liveness signal
   */
  recordEvent() {
    this._lastEventAt = Date.now();
    this._stats.eventsReceived++;
  }

  /**
   * Stop the liveness monitor (SSRK-127)
   * Clears all timers - call on stop/close/give-up
   */
  stop() {
    if (!this._isRunning) return;
    
    this._isRunning = false;
    
    if (this._checkTimer) {
      clearTimeout(this._checkTimer);
      this._checkTimer = null;
    }
    
    if (this._debug) {
      console.log(`[LIVENESS] Stopped (heartbeats: ${this._stats.heartbeatsReceived}, failures: ${this._stats.failureCount})`);
    }
  }

  /**
   * Reset state for new connection
   */
  reset() {
    this.stop();
    this._lastHeartbeatAt = null;
    this._lastEventAt = null;
    this._startedAt = null;
    this._firstHeartbeatReceived = false;
    this._hasFailed = false;
  }

  /**
   * Check if monitor is running
   */
  get isRunning() {
    return this._isRunning;
  }

  /**
   * Check if first heartbeat has been received
   */
  get hasReceivedHeartbeat() {
    return this._firstHeartbeatReceived;
  }

  /**
   * Get last heartbeat timestamp (SSRK-120)
   */
  get lastHeartbeatAt() {
    return this._lastHeartbeatAt;
  }

  /**
   * Get time since last heartbeat
   */
  get timeSinceLastHeartbeat() {
    if (!this._lastHeartbeatAt) return null;
    return Date.now() - this._lastHeartbeatAt;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      isRunning: this._isRunning,
      timeoutMs: this.timeoutMs,
      gracePeriodMs: this.gracePeriodMs,
      lastHeartbeatAt: this._lastHeartbeatAt,
      timeSinceLastHeartbeat: this.timeSinceLastHeartbeat,
      firstHeartbeatReceived: this._firstHeartbeatReceived,
      hasFailed: this._hasFailed,
      ...this._stats,
    };
  }

  /**
   * Update timeout configuration
   */
  setTimeoutMs(timeoutMs) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Enable/disable debug logging
   */
  setDebug(enabled) {
    this._debug = enabled;
  }
}

/**
 * Create a liveness monitor
 */
export function createLivenessMonitor(options) {
  return new LivenessMonitor(options);
}

export default LivenessMonitor;
