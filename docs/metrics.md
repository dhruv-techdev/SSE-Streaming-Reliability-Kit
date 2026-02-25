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
