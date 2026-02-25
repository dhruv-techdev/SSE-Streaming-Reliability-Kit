/**
 * Stream Manager (SSRK-115)
 * Manages tick events and integrates heartbeat scheduler
 */
import { config } from './config.js';
import { createHeartbeatScheduler } from './heartbeat-scheduler.js';

export class StreamManager {
  constructor(sseWriter, options = {}) {
    this.writer = sseWriter;
    this.connectionId = options.connectionId || sseWriter.connectionId || 'unknown';
    this.tickInterval = options.tickInterval || config.sse.tickInterval;
    this.heartbeatInterval = options.heartbeatInterval || config.sse.heartbeatInterval;
    this.debug = options.debug || config.log.heartbeats;
    
    // Event callbacks
    this.onHeartbeatError = options.onHeartbeatError || null;
    
    this.tickTimer = null;
    this.sequence = 0;
    this.lastActivityTime = Date.now();
    this.isRunning = false;
    
    // Per-connection heartbeat scheduler (SSRK-115)
    this._heartbeatScheduler = createHeartbeatScheduler({
      intervalMs: this.heartbeatInterval,
      connectionId: this.connectionId,
      writer: this.writer,
      debug: this.debug,
      onHeartbeat: (info) => this._onHeartbeat(info),
      onError: (info) => this._onHeartbeatError(info),
    });
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

    // Start tick interval
    this.tickTimer = setInterval(() => {
      this.sendTick();
    }, this.tickInterval);

    // Start heartbeat scheduler (SSRK-115)
    this._heartbeatScheduler.start();

    return this;
  }

  /**
   * Handle heartbeat sent
   */
  _onHeartbeat(info) {
    this.lastActivityTime = Date.now();
  }

  /**
   * Handle heartbeat error (SSRK-116)
   */
  _onHeartbeatError(info) {
    // Connection is dead - stop everything
    this.stop();
    
    if (this.onHeartbeatError) {
      this.onHeartbeatError(info);
    }
  }

  /**
   * Send a tick event
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
   * Send a custom event
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
    
    // Stop heartbeat scheduler
    this._heartbeatScheduler.stop();
  }

  /**
   * Get stream statistics
   */
  get stats() {
    return {
      connectionId: this.connectionId,
      sequence: this.sequence,
      isRunning: this.isRunning,
      lastActivityTime: this.lastActivityTime,
      heartbeat: this._heartbeatScheduler.getStats(),
      writerStats: this.writer.stats,
    };
  }

  /**
   * Get heartbeat scheduler (for testing/inspection)
   */
  get heartbeatScheduler() {
    return this._heartbeatScheduler;
  }
}

/**
 * Factory function
 */
export function createStreamManager(sseWriter, options) {
  return new StreamManager(sseWriter, options);
}
