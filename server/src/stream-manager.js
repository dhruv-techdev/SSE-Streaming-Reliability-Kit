/**
 * Stream Manager (SSRK-70, SSRK-72)
 * Manages tick events and heartbeats for SSE streams
 */
import { config } from './config.js';

export class StreamManager {
  constructor(sseWriter, options = {}) {
    this.writer = sseWriter;
    this.tickInterval = options.tickInterval || config.sse.tickInterval;
    this.heartbeatInterval = options.heartbeatInterval || config.sse.heartbeatInterval;
    
    this.tickTimer = null;
    this.heartbeatTimer = null;
    this.sequence = 0;
    this.lastActivityTime = Date.now();
    this.isRunning = false;
  }

  /**
   * Start streaming ticks and heartbeats
   */
  start() {
    if (this.isRunning) return this;
    this.isRunning = true;

    // Send initial control.open
    this.writer.sendControl('open', {
      server_version: '1.0.0',
      tick_interval: this.tickInterval,
      heartbeat_interval: this.heartbeatInterval,
    }, { retry: config.sse.retryTimeout });

    // Start tick interval (ST-03)
    this.tickTimer = setInterval(() => {
      this.sendTick();
    }, this.tickInterval);

    // Start heartbeat interval (ST-05)
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeat();
    }, this.heartbeatInterval);

    return this;
  }

  /**
   * Send a tick event (ST-03)
   */
  sendTick() {
    if (!this.writer.connected) {
      this.stop();
      return;
    }

    this.sequence++;
    this.writer.sendDomainEvent('stream', 'tick', {
      sequence: this.sequence,
      timestamp: new Date().toISOString(),
      message: `Tick #${this.sequence}`,
    }, {
      stream_id: 'default',
      sequence: this.sequence,
    });
    this.lastActivityTime = Date.now();
  }

  /**
   * Check if heartbeat is needed (ST-05)
   * Only send heartbeat if no other event was sent recently
   */
  checkHeartbeat() {
    if (!this.writer.connected) {
      this.stop();
      return;
    }

    const timeSinceActivity = Date.now() - this.lastActivityTime;
    if (timeSinceActivity >= this.heartbeatInterval) {
      this.writer.sendHeartbeat();
      this.lastActivityTime = Date.now();
    }
  }

  /**
   * Send a custom event through this stream
   */
  sendEvent(entity, action, payload, options = {}) {
    if (!this.writer.connected) return false;
    
    this.sequence++;
    const result = this.writer.sendDomainEvent(entity, action, payload, {
      ...options,
      stream_id: options.stream_id || 'default',
      sequence: this.sequence,
    });
    this.lastActivityTime = Date.now();
    return result;
  }

  /**
   * Stop all intervals
   */
  stop() {
    this.isRunning = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Get stream statistics
   */
  get stats() {
    return {
      sequence: this.sequence,
      isRunning: this.isRunning,
      lastActivityTime: this.lastActivityTime,
      writerStats: this.writer.stats,
    };
  }
}

/**
 * Factory function
 */
export function createStreamManager(sseWriter, options) {
  return new StreamManager(sseWriter, options);
}
