# SSE Server Metrics Documentation

This document describes the metrics exposed by the SSE Streaming Reliability Kit server.

## Endpoint

Metrics are available at:
- **Prometheus format**: `GET /metrics` (text/plain)
- **JSON format**: `GET /health` (application/json, under `metrics` key)

## Metrics Reference

### Gauges

| Metric | Type | Description |
|--------|------|-------------|
| `sse_server_active_streams` | Gauge | Current number of active SSE connections. Increases on connect, decreases on disconnect. Never goes negative. |
| `sse_server_uptime_seconds` | Gauge | Server uptime in seconds since start. |

### Counters

| Metric | Labels | Description |
|--------|--------|-------------|
| `sse_server_streams_opened_total` | - | Total number of SSE streams opened since server start. Monotonically increasing. |
| `sse_server_disconnects_total` | `reason` | Total disconnections, labeled by reason. See [Disconnect Reasons](#disconnect-reasons). |
| `sse_server_rejected_connections_total` | - | Total connections rejected due to max connections limit (503 responses). |
| `sse_server_heartbeats_sent_total` | - | Total heartbeat events successfully sent to clients. |
| `sse_server_heartbeats_failed_total` | - | Total heartbeat sends that failed (dead sockets). |
| `sse_server_events_sent_total` | - | Total events sent to clients (all types). |
| `sse_server_replays_attempted_total` | - | Total replay attempts (connections with Last-Event-ID). |
| `sse_server_replays_succeeded_total` | - | Total successful replays. |
| `sse_server_replays_failed_total` | - | Total failed replays (cannot resume). |
| `sse_server_replay_events_sent_total` | - | Total events sent during replay operations. |
| `sse_server_cannot_resume_total` | `reason` | Cannot resume events by reason. |

### Disconnect Reasons

The `sse_server_disconnects_total` counter uses these reason labels:

| Reason | Description |
|--------|-------------|
| `client_close` | Client closed the connection normally |
| `client_abort` | Client aborted the connection |
| `client_timeout` | Client timed out |
| `server_shutdown` | Server initiated shutdown |
| `server_error` | Server-side error |
| `network_error` | Network-level error |
| `heartbeat_missed` | Client detected missed heartbeat |

### Cannot Resume Reasons

The `sse_server_cannot_resume_total` counter uses these reason labels:

| Reason | Description |
|--------|-------------|
| `event_not_found` | Requested Last-Event-ID not in buffer (expired/evicted) |
| `buffer_expired` | Buffer was cleared or reset |
| `replay_too_large` | Too many events to replay |

## Example Output

### Prometheus Format
```
# HELP sse_server_uptime_seconds Server uptime in seconds
# TYPE sse_server_uptime_seconds gauge
sse_server_uptime_seconds 3600

# HELP sse_server_active_streams Current number of active SSE streams
# TYPE sse_server_active_streams gauge
sse_server_active_streams 42

# HELP sse_server_streams_opened_total Total number of SSE streams opened
# TYPE sse_server_streams_opened_total counter
sse_server_streams_opened_total 1234

# HELP sse_server_disconnects_total Total disconnections by reason
# TYPE sse_server_disconnects_total counter
sse_server_disconnects_total{reason="client_close"} 1100
sse_server_disconnects_total{reason="network_error"} 50
sse_server_disconnects_total{reason="server_shutdown"} 42

# HELP sse_server_rejected_connections_total Total connections rejected (overload)
# TYPE sse_server_rejected_connections_total counter
sse_server_rejected_connections_total 5

# HELP sse_server_heartbeats_sent_total Total heartbeat events sent
# TYPE sse_server_heartbeats_sent_total counter
sse_server_heartbeats_sent_total 50000
```

### JSON Format (from /health)
```json
{
  "status": "ok",
  "timestamp": "2024-06-15T12:00:00.000Z",
  "connections": 42,
  "metrics": {
    "uptime_seconds": 3600,
    "gauges": {
      "active_streams": 42
    },
    "counters": {
      "streams_opened_total": 1234,
      "disconnects_total": {
        "client_close": 1100,
        "network_error": 50,
        "server_shutdown": 42
      },
      "rejected_connections_total": 5,
      "heartbeats_sent_total": 50000,
      "heartbeats_failed_total": 3,
      "events_sent_total": 100000,
      "replays_attempted_total": 200,
      "replays_succeeded_total": 180,
      "replays_failed_total": 20,
      "replay_events_sent_total": 5000,
      "cannot_resume_total": {
        "event_not_found": 20
      }
    }
  }
}
```

## Usage with Prometheus

Add the following to your `prometheus.yml`:
```yaml
scrape_configs:
  - job_name: 'sse-server'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

## Alerting Examples

### High Connection Rejection Rate
```yaml
alert: HighConnectionRejectionRate
expr: rate(sse_server_rejected_connections_total[5m]) > 1
for: 5m
labels:
  severity: warning
annotations:
  summary: "High SSE connection rejection rate"
  description: "More than 1 connection rejected per second for 5 minutes"
```

### No Active Streams
```yaml
alert: NoActiveStreams
expr: sse_server_active_streams == 0
for: 5m
labels:
  severity: warning
annotations:
  summary: "No active SSE streams"
  description: "Server has no active connections for 5 minutes"
```

### High Heartbeat Failure Rate
```yaml
alert: HighHeartbeatFailureRate
expr: rate(sse_server_heartbeats_failed_total[5m]) / rate(sse_server_heartbeats_sent_total[5m]) > 0.01
for: 5m
labels:
  severity: warning
annotations:
  summary: "High heartbeat failure rate"
  description: "More than 1% of heartbeats are failing"
```

---

# Client Metrics

This section documents the metrics available in the SSE client.

## Metrics Sink Interface

The client uses a pluggable metrics sink interface (`MetricsSink`) that allows you to send metrics to any backend:
```javascript
import { connectSSE, createInMemorySink, createConsoleSink } from 'sse-streaming-reliability-kit/client';

// In-memory sink (for testing)
const sink = createInMemorySink();

// Console sink (for development)
const consoleSink = createConsoleSink({ enabled: true });

const connector = connectSSE(url, {
  metricsSink: sink,
  trackEventLag: true,
});
```

## Client Metrics Reference

### Counters

| Metric | Labels | Description |
|--------|--------|-------------|
| `sse_client_reconnect_attempts_total` | `reason` | Total reconnection attempts, labeled by disconnect reason |
| `sse_client_resume_success_total` | - | Total successful resume operations (replay completed) |
| `sse_client_resume_failure_total` | `reason` | Total failed resume operations (cannot-resume) |
| `sse_client_duplicate_events_total` | `type` | Total duplicate events detected and dropped |
| `sse_client_liveness_failures_total` | - | Total liveness check failures (missed heartbeats) |
| `sse_client_events_received_total` | - | Total events received from server |
| `sse_client_events_processed_total` | - | Total events processed (after dedup/ordering) |
| `sse_client_out_of_order_events_total` | - | Total out-of-order events dropped |
| `sse_client_connections_opened_total` | - | Total connections opened |
| `sse_client_connections_closed_total` | `reason` | Total connections closed by reason |

### Gauges

| Metric | Labels | Description |
|--------|--------|-------------|
| `sse_client_connection_state` | `state` | Current connection state (0=idle, 1=connecting, 2=open, 3=retrying, 4=closed) |

### Histograms

| Metric | Description |
|--------|-------------|
| `sse_client_event_lag_ms` | Event delivery lag in milliseconds (now - event.ts) |

## Event Lag Statistics

The client tracks event lag internally and provides statistics:
```javascript
const stats = connector.getStats();

console.log(stats.lag);
// {
//   count: 100,   // Number of samples
//   min: 5,       // Minimum lag (ms)
//   max: 150,     // Maximum lag (ms)
//   avg: 25,      // Average lag (ms)
//   p50: 20,      // 50th percentile
//   p95: 80,      // 95th percentile
//   p99: 120      // 99th percentile
// }
```

## Custom Metrics Sink

Implement your own sink to send metrics to Prometheus, StatsD, DataDog, etc.:
```javascript
import { MetricsSink } from 'sse-streaming-reliability-kit/client';

class PrometheusMetricsSink extends MetricsSink {
  constructor(registry) {
    super();
    this.counters = {};
    this.gauges = {};
    this.histograms = {};
    this.registry = registry;
  }

  incCounter(name, value = 1, labels = {}) {
    // Get or create counter in Prometheus registry
    if (!this.counters[name]) {
      this.counters[name] = new this.registry.Counter({
        name,
        help: `Counter ${name}`,
        labelNames: Object.keys(labels),
      });
    }
    this.counters[name].inc(labels, value);
  }

  setGauge(name, value, labels = {}) {
    // Get or create gauge
    if (!this.gauges[name]) {
      this.gauges[name] = new this.registry.Gauge({
        name,
        help: `Gauge ${name}`,
        labelNames: Object.keys(labels),
      });
    }
    this.gauges[name].set(labels, value);
  }

  observe(name, value, labels = {}) {
    // Get or create histogram
    if (!this.histograms[name]) {
      this.histograms[name] = new this.registry.Histogram({
        name,
        help: `Histogram ${name}`,
        labelNames: Object.keys(labels),
      });
    }
    this.histograms[name].observe(labels, value);
  }
}
```
