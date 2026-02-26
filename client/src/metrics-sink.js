/**
 * Client Metrics Sink (SSRK-166 through SSRK-171)
 * Pluggable metrics collection for client reliability measurement
 */

/**
 * Metrics Sink Interface (SSRK-166)
 * Defines the contract for metrics collectors
 */
export class MetricsSink {
  // Counters
  incReconnectAttempts(reason) {}
  incResumeSuccess() {}
  incResumeFailure(reason) {}
  incDuplicateEvents() {}
  incLivenessFailures() {}
  incOutOfOrderDropped() {}
  incEventsReceived() {}
  incEventsProcessed() {}
  
  // Observations
  observeEventLag(lagMs) {}
  
  // Export
  getMetrics() { return {}; }
  reset() {}
}

/**
 * No-op Sink (SSRK-166)
 * Default sink that does nothing - for production without metrics overhead
 */
export class NoopSink extends MetricsSink {
  // All methods are inherited as no-ops
}

/**
 * Console Sink (SSRK-166)
 * Logs metrics to console - useful for development/debugging
 */
export class ConsoleSink extends MetricsSink {
  constructor(options = {}) {
    super();
    this._prefix = options.prefix || '[METRICS]';
    this._logLevel = options.logLevel || 'debug';
  }

  _log(metric, value, labels = {}) {
    const labelStr = Object.keys(labels).length > 0 
      ? ` ${JSON.stringify(labels)}` 
      : '';
    console[this._logLevel](`${this._prefix} ${metric}: ${value}${labelStr}`);
  }

  incReconnectAttempts(reason) {
    this._log('reconnect_attempts_total', '+1', { reason });
  }

  incResumeSuccess() {
    this._log('resume_success_total', '+1');
  }

  incResumeFailure(reason) {
    this._log('resume_failure_total', '+1', { reason });
  }

  incDuplicateEvents() {
    this._log('duplicate_events_total', '+1');
  }

  incLivenessFailures() {
    this._log('liveness_failures_total', '+1');
  }

  incOutOfOrderDropped() {
    this._log('out_of_order_dropped_total', '+1');
  }

  incEventsReceived() {
    this._log('events_received_total', '+1');
  }

  incEventsProcessed() {
    this._log('events_processed_total', '+1');
  }

  observeEventLag(lagMs) {
    this._log('event_lag_ms', lagMs);
  }
}

/**
 * In-Memory Metrics Collector (SSRK-166)
 * Collects metrics in memory for testing and simple use cases
 */
export class InMemoryMetricsSink extends MetricsSink {
  constructor() {
    super();
    this._counters = {
      reconnect_attempts_total: 0,
      reconnect_attempts_by_reason: {},
      resume_success_total: 0,
      resume_failure_total: 0,
      resume_failure_by_reason: {},
      duplicate_events_total: 0,
      liveness_failures_total: 0,
      out_of_order_dropped_total: 0,
      events_received_total: 0,
      events_processed_total: 0,
    };
    
    this._observations = {
      event_lag_ms: [],
    };
    
    this._startTime = Date.now();
  }

  // Counters (SSRK-167, SSRK-168, SSRK-169, SSRK-171)

  /**
   * Increment reconnect attempts (SSRK-167)
   */
  incReconnectAttempts(reason = 'unknown') {
    this._counters.reconnect_attempts_total++;
    if (!this._counters.reconnect_attempts_by_reason[reason]) {
      this._counters.reconnect_attempts_by_reason[reason] = 0;
    }
    this._counters.reconnect_attempts_by_reason[reason]++;
  }

  /**
   * Increment resume success (SSRK-168)
   */
  incResumeSuccess() {
    this._counters.resume_success_total++;
  }

  /**
   * Increment resume failure (SSRK-168)
   */
  incResumeFailure(reason = 'unknown') {
    this._counters.resume_failure_total++;
    if (!this._counters.resume_failure_by_reason[reason]) {
      this._counters.resume_failure_by_reason[reason] = 0;
    }
    this._counters.resume_failure_by_reason[reason]++;
  }

  /**
   * Increment duplicate events dropped (SSRK-169)
   */
  incDuplicateEvents() {
    this._counters.duplicate_events_total++;
  }

  /**
   * Increment liveness failures (SSRK-171)
   */
  incLivenessFailures() {
    this._counters.liveness_failures_total++;
  }

  /**
   * Increment out-of-order dropped
   */
  incOutOfOrderDropped() {
    this._counters.out_of_order_dropped_total++;
  }

  /**
   * Increment events received
   */
  incEventsReceived() {
    this._counters.events_received_total++;
  }

  /**
   * Increment events processed
   */
  incEventsProcessed() {
    this._counters.events_processed_total++;
  }

  // Observations (SSRK-170)

  /**
   * Observe event lag (SSRK-170)
   * @param {number} lagMs - Lag in milliseconds (now - event.ts)
   */
  observeEventLag(lagMs) {
    this._observations.event_lag_ms.push({
      value: lagMs,
      timestamp: Date.now(),
    });
    
    // Keep last 1000 observations
    if (this._observations.event_lag_ms.length > 1000) {
      this._observations.event_lag_ms.shift();
    }
  }

  /**
   * Get event lag statistics
   */
  getEventLagStats() {
    const lags = this._observations.event_lag_ms.map(o => o.value);
    if (lags.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...lags].sort((a, b) => a - b);
    const sum = lags.reduce((a, b) => a + b, 0);
    
    return {
      count: lags.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: Math.round(sum / lags.length),
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  /**
   * Get all metrics
   */
  getMetrics() {
    return {
      uptime_ms: Date.now() - this._startTime,
      counters: { ...this._counters },
      event_lag: this.getEventLagStats(),
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this._counters = {
      reconnect_attempts_total: 0,
      reconnect_attempts_by_reason: {},
      resume_success_total: 0,
      resume_failure_total: 0,
      resume_failure_by_reason: {},
      duplicate_events_total: 0,
      liveness_failures_total: 0,
      out_of_order_dropped_total: 0,
      events_received_total: 0,
      events_processed_total: 0,
    };
    this._observations = {
      event_lag_ms: [],
    };
    this._startTime = Date.now();
  }

  /**
   * Export in Prometheus text format
   */
  toPrometheus() {
    const lines = [];
    const prefix = 'sse_client';

    lines.push(`# HELP ${prefix}_reconnect_attempts_total Total reconnection attempts`);
    lines.push(`# TYPE ${prefix}_reconnect_attempts_total counter`);
    lines.push(`${prefix}_reconnect_attempts_total ${this._counters.reconnect_attempts_total}`);
    lines.push('');

    lines.push(`# HELP ${prefix}_resume_success_total Successful resume operations`);
    lines.push(`# TYPE ${prefix}_resume_success_total counter`);
    lines.push(`${prefix}_resume_success_total ${this._counters.resume_success_total}`);
    lines.push('');

    lines.push(`# HELP ${prefix}_resume_failure_total Failed resume operations`);
    lines.push(`# TYPE ${prefix}_resume_failure_total counter`);
    lines.push(`${prefix}_resume_failure_total ${this._counters.resume_failure_total}`);
    lines.push('');

    lines.push(`# HELP ${prefix}_duplicate_events_total Duplicate events dropped`);
    lines.push(`# TYPE ${prefix}_duplicate_events_total counter`);
    lines.push(`${prefix}_duplicate_events_total ${this._counters.duplicate_events_total}`);
    lines.push('');

    lines.push(`# HELP ${prefix}_liveness_failures_total Liveness check failures`);
    lines.push(`# TYPE ${prefix}_liveness_failures_total counter`);
    lines.push(`${prefix}_liveness_failures_total ${this._counters.liveness_failures_total}`);
    lines.push('');

    lines.push(`# HELP ${prefix}_out_of_order_dropped_total Out-of-order events dropped`);
    lines.push(`# TYPE ${prefix}_out_of_order_dropped_total counter`);
    lines.push(`${prefix}_out_of_order_dropped_total ${this._counters.out_of_order_dropped_total}`);
    lines.push('');

    lines.push(`# HELP ${prefix}_events_received_total Total events received`);
    lines.push(`# TYPE ${prefix}_events_received_total counter`);
    lines.push(`${prefix}_events_received_total ${this._counters.events_received_total}`);
    lines.push('');

    lines.push(`# HELP ${prefix}_events_processed_total Total events processed`);
    lines.push(`# TYPE ${prefix}_events_processed_total counter`);
    lines.push(`${prefix}_events_processed_total ${this._counters.events_processed_total}`);
    lines.push('');

    const lagStats = this.getEventLagStats();
    lines.push(`# HELP ${prefix}_event_lag_ms Event delivery lag in milliseconds`);
    lines.push(`# TYPE ${prefix}_event_lag_ms summary`);
    lines.push(`${prefix}_event_lag_ms{quantile="0.5"} ${lagStats.p50}`);
    lines.push(`${prefix}_event_lag_ms{quantile="0.95"} ${lagStats.p95}`);
    lines.push(`${prefix}_event_lag_ms{quantile="0.99"} ${lagStats.p99}`);
    lines.push(`${prefix}_event_lag_ms_count ${lagStats.count}`);
    lines.push('');

    return lines.join('\n');
  }
}

/**
 * Create a metrics sink
 * @param {string} type - 'noop', 'console', 'memory'
 * @param {Object} options - Sink-specific options
 */
export function createMetricsSink(type = 'memory', options = {}) {
  switch (type) {
    case 'noop':
      return new NoopSink();
    case 'console':
      return new ConsoleSink(options);
    case 'memory':
    default:
      return new InMemoryMetricsSink();
  }
}

export default InMemoryMetricsSink;
