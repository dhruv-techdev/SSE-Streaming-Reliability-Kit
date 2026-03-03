/**
 * Server Metrics (SSRK-158 through SSRK-163)
 * Core reliability metrics in Prometheus text format
 */

/**
 * Metrics Registry Class
 * Tracks all server metrics with Prometheus-compatible output
 */
export class MetricsRegistry {
  constructor() {
    // Gauges (SSRK-159)
    this._gauges = {
      active_streams: 0,
    };

    // Counters (SSRK-160, SSRK-161, SSRK-162, SSRK-163)
    this._counters = {
      streams_opened_total: 0,
      disconnects_total: {}, // by reason label
      rejected_connections_total: 0,
      heartbeats_sent_total: 0,
      heartbeats_failed_total: 0,
      events_sent_total: 0,
      events_buffered_total: 0,
      replays_attempted_total: 0,
      replays_succeeded_total: 0,
      replays_failed_total: 0,
      replay_events_sent_total: 0,
      cannot_resume_total: {}, // by reason label
    };

    // Histograms (optional - for future use)
    this._histograms = {};

    // Metadata
    this._startTime = Date.now();
  }

  // ==================
  // Gauge Operations (SSRK-159)
  // ==================

  /**
   * Increment active streams gauge
   */
  incActiveStreams() {
    this._gauges.active_streams++;
  }

  /**
   * Decrement active streams gauge
   * Never goes below zero
   */
  decActiveStreams() {
    if (this._gauges.active_streams > 0) {
      this._gauges.active_streams--;
    }
  }

  /**
   * Get current active streams
   */
  getActiveStreams() {
    return this._gauges.active_streams;
  }

  // ==================
  // Counter Operations
  // ==================

  /**
   * Increment streams opened counter (SSRK-160)
   */
  incStreamsOpened() {
    this._counters.streams_opened_total++;
  }

  /**
   * Increment disconnects counter with reason label (SSRK-161)
   * @param {string} reason - Disconnect reason
   */
  incDisconnects(reason) {
    if (!this._counters.disconnects_total[reason]) {
      this._counters.disconnects_total[reason] = 0;
    }
    this._counters.disconnects_total[reason]++;
  }

  /**
   * Increment rejected connections counter (SSRK-162)
   */
  incRejectedConnections() {
    this._counters.rejected_connections_total++;
  }

  /**
   * Increment heartbeats sent counter (SSRK-163)
   */
  incHeartbeatsSent() {
    this._counters.heartbeats_sent_total++;
  }

  /**
   * Increment heartbeats failed counter
   */
  incHeartbeatsFailed() {
    this._counters.heartbeats_failed_total++;
  }

  /**
   * Increment events sent counter
   */
  incEventsSent() {
    this._counters.events_sent_total++;
  }

  /**
   * Increment events buffered counter
   */
  incEventsBuffered() {
    this._counters.events_buffered_total++;
  }

  /**
   * Increment replays attempted
   */
  incReplaysAttempted() {
    this._counters.replays_attempted_total++;
  }

  /**
   * Increment replays succeeded
   */
  incReplaysSucceeded() {
    this._counters.replays_succeeded_total++;
  }

  /**
   * Increment replays failed
   */
  incReplaysFailed() {
    this._counters.replays_failed_total++;
  }

  /**
   * Increment replay events sent
   * @param {number} count - Number of events replayed
   */
  incReplayEventsSent(count = 1) {
    this._counters.replay_events_sent_total += count;
  }

  /**
   * Increment cannot resume counter with reason
   * @param {string} reason - Cannot resume reason
   */
  incCannotResume(reason) {
    if (!this._counters.cannot_resume_total[reason]) {
      this._counters.cannot_resume_total[reason] = 0;
    }
    this._counters.cannot_resume_total[reason]++;
  }

  // ==================
  // Prometheus Export (SSRK-158)
  // ==================

  /**
   * Export metrics in Prometheus text format
   * @returns {string} Prometheus-formatted metrics
   */
  toPrometheus() {
    const lines = [];
    const prefix = 'sse_server';

    // Uptime
    const uptimeSeconds = Math.floor((Date.now() - this._startTime) / 1000);
    lines.push(`# HELP ${prefix}_uptime_seconds Server uptime in seconds`);
    lines.push(`# TYPE ${prefix}_uptime_seconds gauge`);
    lines.push(`${prefix}_uptime_seconds ${uptimeSeconds}`);
    lines.push('');

    // Active streams gauge (SSRK-159)
    lines.push(`# HELP ${prefix}_active_streams Current number of active SSE streams`);
    lines.push(`# TYPE ${prefix}_active_streams gauge`);
    lines.push(`${prefix}_active_streams ${this._gauges.active_streams}`);
    lines.push('');

    // Streams opened total (SSRK-160)
    lines.push(`# HELP ${prefix}_streams_opened_total Total number of SSE streams opened`);
    lines.push(`# TYPE ${prefix}_streams_opened_total counter`);
    lines.push(`${prefix}_streams_opened_total ${this._counters.streams_opened_total}`);
    lines.push('');

    // Disconnects total by reason (SSRK-161)
    lines.push(`# HELP ${prefix}_disconnects_total Total disconnections by reason`);
    lines.push(`# TYPE ${prefix}_disconnects_total counter`);
    const disconnectReasons = Object.keys(this._counters.disconnects_total);
    if (disconnectReasons.length === 0) {
      lines.push(`${prefix}_disconnects_total{reason="none"} 0`);
    } else {
      for (const reason of disconnectReasons) {
        lines.push(
          `${prefix}_disconnects_total{reason="${reason}"} ${this._counters.disconnects_total[reason]}`
        );
      }
    }
    lines.push('');

    // Rejected connections total (SSRK-162)
    lines.push(`# HELP ${prefix}_rejected_connections_total Total connections rejected (overload)`);
    lines.push(`# TYPE ${prefix}_rejected_connections_total counter`);
    lines.push(`${prefix}_rejected_connections_total ${this._counters.rejected_connections_total}`);
    lines.push('');

    // Heartbeats sent total (SSRK-163)
    lines.push(`# HELP ${prefix}_heartbeats_sent_total Total heartbeat events sent`);
    lines.push(`# TYPE ${prefix}_heartbeats_sent_total counter`);
    lines.push(`${prefix}_heartbeats_sent_total ${this._counters.heartbeats_sent_total}`);
    lines.push('');

    // Heartbeats failed total
    lines.push(`# HELP ${prefix}_heartbeats_failed_total Total heartbeat sends that failed`);
    lines.push(`# TYPE ${prefix}_heartbeats_failed_total counter`);
    lines.push(`${prefix}_heartbeats_failed_total ${this._counters.heartbeats_failed_total}`);
    lines.push('');

    // Events sent total
    lines.push(`# HELP ${prefix}_events_sent_total Total events sent to clients`);
    lines.push(`# TYPE ${prefix}_events_sent_total counter`);
    lines.push(`${prefix}_events_sent_total ${this._counters.events_sent_total}`);
    lines.push('');

    // Replays
    lines.push(`# HELP ${prefix}_replays_attempted_total Total replay attempts`);
    lines.push(`# TYPE ${prefix}_replays_attempted_total counter`);
    lines.push(`${prefix}_replays_attempted_total ${this._counters.replays_attempted_total}`);
    lines.push('');

    lines.push(`# HELP ${prefix}_replays_succeeded_total Total successful replays`);
    lines.push(`# TYPE ${prefix}_replays_succeeded_total counter`);
    lines.push(`${prefix}_replays_succeeded_total ${this._counters.replays_succeeded_total}`);
    lines.push('');

    lines.push(`# HELP ${prefix}_replays_failed_total Total failed replays (cannot resume)`);
    lines.push(`# TYPE ${prefix}_replays_failed_total counter`);
    lines.push(`${prefix}_replays_failed_total ${this._counters.replays_failed_total}`);
    lines.push('');

    lines.push(`# HELP ${prefix}_replay_events_sent_total Total events sent during replay`);
    lines.push(`# TYPE ${prefix}_replay_events_sent_total counter`);
    lines.push(`${prefix}_replay_events_sent_total ${this._counters.replay_events_sent_total}`);
    lines.push('');

    // Cannot resume by reason
    lines.push(`# HELP ${prefix}_cannot_resume_total Cannot resume events by reason`);
    lines.push(`# TYPE ${prefix}_cannot_resume_total counter`);
    const cannotResumeReasons = Object.keys(this._counters.cannot_resume_total);
    if (cannotResumeReasons.length === 0) {
      lines.push(`${prefix}_cannot_resume_total{reason="none"} 0`);
    } else {
      for (const reason of cannotResumeReasons) {
        lines.push(
          `${prefix}_cannot_resume_total{reason="${reason}"} ${this._counters.cannot_resume_total[reason]}`
        );
      }
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Export metrics as JSON (for /health endpoint)
   * @returns {Object} Metrics object
   */
  toJSON() {
    return {
      uptime_seconds: Math.floor((Date.now() - this._startTime) / 1000),
      gauges: { ...this._gauges },
      counters: {
        streams_opened_total: this._counters.streams_opened_total,
        disconnects_total: { ...this._counters.disconnects_total },
        rejected_connections_total: this._counters.rejected_connections_total,
        heartbeats_sent_total: this._counters.heartbeats_sent_total,
        heartbeats_failed_total: this._counters.heartbeats_failed_total,
        events_sent_total: this._counters.events_sent_total,
        replays_attempted_total: this._counters.replays_attempted_total,
        replays_succeeded_total: this._counters.replays_succeeded_total,
        replays_failed_total: this._counters.replays_failed_total,
        replay_events_sent_total: this._counters.replay_events_sent_total,
        cannot_resume_total: { ...this._counters.cannot_resume_total },
      },
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  reset() {
    this._gauges.active_streams = 0;
    this._counters.streams_opened_total = 0;
    this._counters.disconnects_total = {};
    this._counters.rejected_connections_total = 0;
    this._counters.heartbeats_sent_total = 0;
    this._counters.heartbeats_failed_total = 0;
    this._counters.events_sent_total = 0;
    this._counters.events_buffered_total = 0;
    this._counters.replays_attempted_total = 0;
    this._counters.replays_succeeded_total = 0;
    this._counters.replays_failed_total = 0;
    this._counters.replay_events_sent_total = 0;
    this._counters.cannot_resume_total = {};
    this._startTime = Date.now();
  }
}

// Singleton instance
let metricsInstance = null;

/**
 * Get the metrics registry singleton
 * @returns {MetricsRegistry}
 */
export function getMetrics() {
  if (!metricsInstance) {
    metricsInstance = new MetricsRegistry();
  }
  return metricsInstance;
}

/**
 * Create a new metrics registry (for testing)
 * @returns {MetricsRegistry}
 */
export function createMetrics() {
  return new MetricsRegistry();
}

export default MetricsRegistry;
