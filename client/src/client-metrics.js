/**
 * Client Metrics (SSRK-166 through SSRK-171)
 * Core reliability metrics for SSE client
 */

/**
 * Metrics Sink Interface (SSRK-166)
 * Pluggable interface for metrics collection
 */
export class MetricsSink {
  /**
   * Increment a counter
   * @param {string} name - Counter name
   * @param {number} value - Increment value (default 1)
   * @param {Object} labels - Optional labels
   */
  incCounter(name, value = 1, labels = {}) {
    // No-op by default
  }

  /**
   * Set a gauge value
   * @param {string} name - Gauge name
   * @param {number} value - Gauge value
   * @param {Object} labels - Optional labels
   */
  setGauge(name, value, labels = {}) {
    // No-op by default
  }

  /**
   * Record a histogram/timing observation
   * @param {string} name - Histogram name
   * @param {number} value - Observed value
   * @param {Object} labels - Optional labels
   */
  observe(name, value, labels = {}) {
    // No-op by default
  }
}

/**
 * Console Metrics Sink (SSRK-166)
 * Logs metrics to console for development/debugging
 */
export class ConsoleMetricsSink extends MetricsSink {
  constructor(options = {}) {
    super();
    this.prefix = options.prefix || '[METRICS]';
    this.enabled = options.enabled !== false;
  }

  incCounter(name, value = 1, labels = {}) {
    if (!this.enabled) return;
    const labelStr = Object.keys(labels).length > 0 ? ` ${JSON.stringify(labels)}` : '';
    console.log(`${this.prefix} COUNTER ${name} +${value}${labelStr}`);
  }

  setGauge(name, value, labels = {}) {
    if (!this.enabled) return;
    const labelStr = Object.keys(labels).length > 0 ? ` ${JSON.stringify(labels)}` : '';
    console.log(`${this.prefix} GAUGE ${name} = ${value}${labelStr}`);
  }

  observe(name, value, labels = {}) {
    if (!this.enabled) return;
    const labelStr = Object.keys(labels).length > 0 ? ` ${JSON.stringify(labels)}` : '';
    console.log(`${this.prefix} HISTOGRAM ${name} ${value}${labelStr}`);
  }
}

/**
 * In-Memory Metrics Sink
 * Stores metrics in memory for testing and inspection
 */
export class InMemoryMetricsSink extends MetricsSink {
  constructor() {
    super();
    this.counters = {};
    this.gauges = {};
    this.histograms = {};
  }

  _labelKey(name, labels) {
    const labelStr = Object.keys(labels)
      .sort()
      .map((k) => `${k}="${labels[k]}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  incCounter(name, value = 1, labels = {}) {
    const key = this._labelKey(name, labels);
    this.counters[key] = (this.counters[key] || 0) + value;
  }

  setGauge(name, value, labels = {}) {
    const key = this._labelKey(name, labels);
    this.gauges[key] = value;
  }

  observe(name, value, labels = {}) {
    const key = this._labelKey(name, labels);
    if (!this.histograms[key]) {
      this.histograms[key] = [];
    }
    this.histograms[key].push(value);
  }

  getCounter(name, labels = {}) {
    const key = this._labelKey(name, labels);
    return this.counters[key] || 0;
  }

  getGauge(name, labels = {}) {
    const key = this._labelKey(name, labels);
    return this.gauges[key];
  }

  getHistogram(name, labels = {}) {
    const key = this._labelKey(name, labels);
    return this.histograms[key] || [];
  }

  reset() {
    this.counters = {};
    this.gauges = {};
    this.histograms = {};
  }

  toJSON() {
    return {
      counters: { ...this.counters },
      gauges: { ...this.gauges },
      histograms: { ...this.histograms },
    };
  }
}

/**
 * Client Metrics Collector (SSRK-167 through SSRK-171)
 * Tracks all client-side reliability metrics
 */
export class ClientMetrics {
  /**
   * Create a client metrics collector
   * @param {Object} options - Configuration
   */
  constructor(options = {}) {
    // Metrics sink (SSRK-166)
    this.sink = options.sink || new MetricsSink();

    // Metric names prefix
    this.prefix = options.prefix || 'sse_client';

    // Track lag measurements
    this._lagMeasurements = [];
    this._maxLagSamples = options.maxLagSamples || 100;
  }

  /**
   * Increment reconnect attempts counter (SSRK-167)
   * @param {string} reason - Optional reason label
   */
  incReconnectAttempts(reason = 'unknown') {
    this.sink.incCounter(`${this.prefix}_reconnect_attempts_total`, 1, { reason });
  }

  /**
   * Increment resume success counter (SSRK-168)
   */
  incResumeSuccess() {
    this.sink.incCounter(`${this.prefix}_resume_success_total`, 1);
  }

  /**
   * Increment resume failure counter (SSRK-168)
   * @param {string} reason - Failure reason
   */
  incResumeFailure(reason = 'unknown') {
    this.sink.incCounter(`${this.prefix}_resume_failure_total`, 1, { reason });
  }

  /**
   * Increment duplicate events counter (SSRK-169)
   * @param {string} eventType - Event type
   */
  incDuplicateEvents(eventType = 'unknown') {
    this.sink.incCounter(`${this.prefix}_duplicate_events_total`, 1, { type: eventType });
  }

  /**
   * Record event lag measurement (SSRK-170)
   * @param {number} lagMs - Lag in milliseconds (now - event.ts)
   */
  recordEventLag(lagMs) {
    this.sink.observe(`${this.prefix}_event_lag_ms`, lagMs);

    // Track internally for stats
    this._lagMeasurements.push(lagMs);
    if (this._lagMeasurements.length > this._maxLagSamples) {
      this._lagMeasurements.shift();
    }
  }

  /**
   * Calculate lag from event timestamp (SSRK-170)
   * @param {string} eventTs - Event timestamp (ISO string)
   * @returns {number} Lag in milliseconds
   */
  calculateLag(eventTs) {
    if (!eventTs) return 0;
    const eventTime = new Date(eventTs).getTime();
    const now = Date.now();
    return Math.max(0, now - eventTime);
  }

  /**
   * Record event lag from envelope (SSRK-170)
   * @param {Object} envelope - Event envelope
   */
  recordEventLagFromEnvelope(envelope) {
    if (envelope && envelope.ts) {
      const lag = this.calculateLag(envelope.ts);
      this.recordEventLag(lag);
    }
  }

  /**
   * Increment liveness failures counter (SSRK-171)
   */
  incLivenessFailures() {
    this.sink.incCounter(`${this.prefix}_liveness_failures_total`, 1);
  }

  /**
   * Increment events received counter
   */
  incEventsReceived() {
    this.sink.incCounter(`${this.prefix}_events_received_total`, 1);
  }

  /**
   * Increment events processed counter
   */
  incEventsProcessed() {
    this.sink.incCounter(`${this.prefix}_events_processed_total`, 1);
  }

  /**
   * Increment out-of-order events counter
   */
  incOutOfOrderEvents() {
    this.sink.incCounter(`${this.prefix}_out_of_order_events_total`, 1);
  }

  /**
   * Increment connection opened counter
   */
  incConnectionsOpened() {
    this.sink.incCounter(`${this.prefix}_connections_opened_total`, 1);
  }

  /**
   * Increment connection closed counter
   * @param {string} reason - Close reason
   */
  incConnectionsClosed(reason = 'unknown') {
    this.sink.incCounter(`${this.prefix}_connections_closed_total`, 1, { reason });
  }

  /**
   * Set connection state gauge
   * @param {string} state - Current state
   */
  setConnectionState(state) {
    // Map state to numeric value for gauge
    const stateMap = {
      idle: 0,
      connecting: 1,
      open: 2,
      retrying: 3,
      closed: 4,
    };
    this.sink.setGauge(`${this.prefix}_connection_state`, stateMap[state] || -1, { state });
  }

  /**
   * Get lag statistics (SSRK-170)
   * @returns {Object} Lag stats
   */
  getLagStats() {
    if (this._lagMeasurements.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...this._lagMeasurements].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: Math.round(sum / count),
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    };
  }

  /**
   * Reset lag measurements
   */
  resetLagMeasurements() {
    this._lagMeasurements = [];
  }

  /**
   * Get the metrics sink
   */
  getSink() {
    return this.sink;
  }
}

/**
 * Create a client metrics collector
 */
export function createClientMetrics(options) {
  return new ClientMetrics(options);
}

/**
 * Create a console metrics sink
 */
export function createConsoleSink(options) {
  return new ConsoleMetricsSink(options);
}

/**
 * Create an in-memory metrics sink
 */
export function createInMemorySink() {
  return new InMemoryMetricsSink();
}

export default ClientMetrics;
