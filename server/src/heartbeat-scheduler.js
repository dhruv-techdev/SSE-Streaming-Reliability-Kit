/**
 * Heartbeat Scheduler (SSRK-115, SSRK-116, SSRK-118)
 * Manages per-connection heartbeat intervals with safe writes
 */
import { createHeartbeat, encodeSSE } from '../../shared/src/index.js';

/**
 * Heartbeat Scheduler Class
 * Ensures every active stream gets keepalives reliably
 */
export class HeartbeatScheduler {
  /**
   * Create a heartbeat scheduler for a connection
   * @param {Object} options - Configuration
   */
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 30000;
    this.connectionId = options.connectionId || 'unknown';
    this.writer = options.writer || null;
    this.onHeartbeat = options.onHeartbeat || null;
    this.onError = options.onError || null;
    this.debug = options.debug || false;

    // State
    this._timer = null;
    this._isRunning = false;
    this._lastHeartbeatTime = null;
    this._heartbeatCount = 0;
    this._failedCount = 0;
  }

  /**
   * Start the heartbeat scheduler (SSRK-115)
   */
  start() {
    if (this._isRunning) return this;

    this._isRunning = true;
    this._scheduleNext();

    if (this.debug) {
      console.log(`[HEARTBEAT] [${this.connectionId}] Started (interval: ${this.intervalMs}ms)`);
    }

    return this;
  }

  /**
   * Schedule next heartbeat
   */
  _scheduleNext() {
    if (!this._isRunning) return;

    this._timer = setTimeout(() => {
      this._sendHeartbeat();
    }, this.intervalMs);
  }

  /**
   * Send heartbeat event (SSRK-115, SSRK-116)
   * Safe write with error handling
   */
  _sendHeartbeat() {
    if (!this._isRunning) return;

    const heartbeat = createHeartbeat({
      interval_ms: this.intervalMs,
      connection_id: this.connectionId,
    });

    // Try to send heartbeat (SSRK-116: safe write)
    let success = false;

    if (this.writer) {
      try {
        success = this.writer.sendEvent(heartbeat);
      } catch (err) {
        success = false;
        this._handleWriteError(err);
      }
    }

    if (success) {
      this._heartbeatCount++;
      this._lastHeartbeatTime = Date.now();
      this._failedCount = 0; // Reset failed count on success

      // Log heartbeat (SSRK-118)
      if (this.debug) {
        console.log(`[HEARTBEAT] [${this.connectionId}] Sent #${this._heartbeatCount}`);
      }

      // Fire callback
      if (this.onHeartbeat) {
        this.onHeartbeat({
          connectionId: this.connectionId,
          count: this._heartbeatCount,
          timestamp: this._lastHeartbeatTime,
        });
      }

      // Schedule next
      this._scheduleNext();
    } else {
      // Write failed (SSRK-116)
      this._failedCount++;

      if (this.debug) {
        console.log(`[HEARTBEAT] [${this.connectionId}] Failed (count: ${this._failedCount})`);
      }

      // Stop scheduler - connection is dead
      this.stop();

      // Fire error callback
      if (this.onError) {
        this.onError({
          connectionId: this.connectionId,
          reason: 'heartbeat_write_failed',
          failedCount: this._failedCount,
        });
      }
    }
  }

  /**
   * Handle write error (SSRK-116)
   */
  _handleWriteError(err) {
    if (this.debug) {
      console.log(`[HEARTBEAT] [${this.connectionId}] Write error: ${err.message}`);
    }
  }

  /**
   * Stop the heartbeat scheduler
   */
  stop() {
    if (!this._isRunning) return;

    this._isRunning = false;

    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    if (this.debug) {
      console.log(`[HEARTBEAT] [${this.connectionId}] Stopped (sent: ${this._heartbeatCount})`);
    }
  }

  /**
   * Check if scheduler is running
   */
  get isRunning() {
    return this._isRunning;
  }

  /**
   * Get statistics (SSRK-118)
   */
  getStats() {
    return {
      connectionId: this.connectionId,
      intervalMs: this.intervalMs,
      isRunning: this._isRunning,
      heartbeatCount: this._heartbeatCount,
      failedCount: this._failedCount,
      lastHeartbeatTime: this._lastHeartbeatTime,
    };
  }

  /**
   * Update the writer reference
   */
  setWriter(writer) {
    this.writer = writer;
  }

  /**
   * Update interval (for dynamic configuration)
   */
  setInterval(intervalMs) {
    this.intervalMs = intervalMs;
  }
}

/**
 * Create a heartbeat scheduler
 */
export function createHeartbeatScheduler(options) {
  return new HeartbeatScheduler(options);
}

export default HeartbeatScheduler;
