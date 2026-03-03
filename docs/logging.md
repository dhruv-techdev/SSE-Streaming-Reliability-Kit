# Structured Logging Documentation

This document describes the structured logging system used by the SSE Streaming Reliability Kit.

## Log Schema

All logs follow a consistent JSON schema (SSRK-174):

```json
{
  "ts": "2024-06-15T12:00:00.000Z",
  "level": "info",
  "component": "server",
  "event": "stream.open",
  "message": "Stream opened: conn-123",
  "stream_id": "conn-123",
  "details": {
    "ip": "192.168.1.1",
    "user_agent": "Mozilla/5.0..."
  }
}
```

### Required Fields

| Field       | Type   | Description                                 |
| ----------- | ------ | ------------------------------------------- |
| `ts`        | string | ISO 8601 timestamp                          |
| `level`     | string | Log level: `debug`, `info`, `warn`, `error` |
| `component` | string | Source component (see below)                |
| `event`     | string | Dot-separated event name                    |
| `message`   | string | Human-readable description                  |

### Optional Fields

| Field       | Type   | Description                  |
| ----------- | ------ | ---------------------------- |
| `stream_id` | string | Connection/stream identifier |
| `details`   | object | Additional context           |

## Log Levels (SSRK-181)

| Level   | Priority | Use Case                                           |
| ------- | -------- | -------------------------------------------------- |
| `debug` | 0        | Detailed debugging info (heartbeats, duplicates)   |
| `info`  | 1        | Normal operations (connects, disconnects, replays) |
| `warn`  | 2        | Recoverable issues (cannot-resume, rejections)     |
| `error` | 3        | Failures (parse errors, heartbeat failures)        |

### Configuring Log Level

**Server:**

```bash
LOG_LEVEL=debug npm run dev
```

**Client:**

```javascript
import { createClientLogger } from 'sse-streaming-reliability-kit/client';

const logger = createClientLogger({ level: 'debug' });
```

## Components

| Component    | Description            |
| ------------ | ---------------------- |
| `server`     | Server-side operations |
| `stream`     | Stream management      |
| `connection` | Connection registry    |
| `heartbeat`  | Heartbeat scheduler    |
| `replay`     | Replay buffer          |
| `client`     | Client-side operations |
| `connector`  | SSE connector          |
| `reconnect`  | Reconnection logic     |
| `liveness`   | Liveness detection     |
| `dedupe`     | Duplicate detection    |
| `ordering`   | Ordering enforcement   |
| `resume`     | Resume operations      |

## Log Events Reference

### Server Stream Lifecycle (SSRK-177)

| Event            | Level | Description                  |
| ---------------- | ----- | ---------------------------- |
| `stream.connect` | info  | Client attempting to connect |
| `stream.open`    | info  | Stream successfully opened   |
| `stream.close`   | info  | Stream closed                |
| `stream.reject`  | warn  | Stream rejected (overload)   |

### Client Lifecycle (SSRK-178)

| Event                    | Level | Description                      |
| ------------------------ | ----- | -------------------------------- |
| `client.connecting`      | info  | Client connecting to server      |
| `client.open`            | info  | Connection established           |
| `client.retry_scheduled` | info  | Retry scheduled after disconnect |
| `client.give_up`         | warn  | Client gave up reconnecting      |
| `client.stop`            | info  | Client stopped (manual)          |
| `client.close`           | info  | Connection closed                |

### Resume Events (SSRK-179)

| Event                  | Level | Description                           |
| ---------------------- | ----- | ------------------------------------- |
| `resume.attempt`       | info  | Resume attempt with Last-Event-ID     |
| `resume.success`       | info  | Resume completed successfully         |
| `resume.cannot_resume` | warn  | Server cannot resume (events expired) |
| `resume.failure`       | error | Resume failed                         |

### Data Events (SSRK-180)

| Event              | Level | Description              |
| ------------------ | ----- | ------------------------ |
| `parse.error`      | error | Failed to parse SSE data |
| `validation.error` | error | Invalid event envelope   |

### Replay Events

| Event              | Level | Description                        |
| ------------------ | ----- | ---------------------------------- |
| `replay.start`     | info  | Replay started                     |
| `replay.end`       | info  | Replay completed                   |
| `replay.truncated` | warn  | Replay truncated (too many events) |

### Heartbeat/Liveness Events

| Event              | Level | Description           |
| ------------------ | ----- | --------------------- |
| `heartbeat.sent`   | debug | Heartbeat sent        |
| `heartbeat.failed` | error | Heartbeat send failed |
| `liveness.failure` | warn  | Liveness check failed |

### Dedupe/Ordering Events

| Event                   | Level | Description                |
| ----------------------- | ----- | -------------------------- |
| `duplicate.detected`    | debug | Duplicate event dropped    |
| `out_of_order.detected` | debug | Out-of-order event dropped |

## Example Log Output

### Server Connection Lifecycle

```json
{"ts":"2024-06-15T12:00:00.000Z","level":"info","component":"server","event":"stream.connect","message":"Stream connecting: conn-abc123","details":{"connection_id":"conn-abc123","ip":"192.168.1.100"}}
{"ts":"2024-06-15T12:00:00.050Z","level":"info","component":"server","event":"stream.open","message":"Stream opened: conn-abc123","details":{"connection_id":"conn-abc123","had_resume":false}}
{"ts":"2024-06-15T12:05:30.000Z","level":"info","component":"server","event":"stream.close","message":"Stream closed: conn-abc123 (client_close)","details":{"connection_id":"conn-abc123","reason":"client_close","duration_ms":330000}}
```

### Client Reconnect Flow

```json
{"ts":"2024-06-15T12:00:00.000Z","level":"info","component":"client","event":"client.connecting","message":"Connecting to http://localhost:3000/stream","details":{"url":"http://localhost:3000/stream"}}
{"ts":"2024-06-15T12:00:00.100Z","level":"info","component":"client","event":"client.open","message":"Connected to http://localhost:3000/stream","details":{"url":"http://localhost:3000/stream","reconnect_count":0}}
{"ts":"2024-06-15T12:05:00.000Z","level":"info","component":"client","event":"client.close","message":"Connection closed: network_error","details":{"reason":"network_error","will_reconnect":true}}
{"ts":"2024-06-15T12:05:00.100Z","level":"info","component":"client","event":"client.retry_scheduled","message":"Retry scheduled: attempt 1 in 1000ms","details":{"attempt":1,"delay_ms":1000,"reason":"network_error"}}
{"ts":"2024-06-15T12:05:01.100Z","level":"info","component":"client","event":"resume.attempt","message":"Attempting resume from evt-abc123...","details":{"last_event_id":"evt-abc123-def456-789"}}
{"ts":"2024-06-15T12:05:01.200Z","level":"info","component":"client","event":"resume.success","message":"Resume successful (5 events replayed)","details":{"event_count":5}}
```

### Cannot Resume Flow

```json
{"ts":"2024-06-15T12:00:00.000Z","level":"info","component":"server","event":"resume.attempt","message":"Resume attempt: conn-xyz","details":{"connection_id":"conn-xyz","last_event_id":"old-event-id"}}
{"ts":"2024-06-15T12:00:00.050Z","level":"warn","component":"server","event":"resume.cannot_resume","message":"Cannot resume: conn-xyz (event_not_found)","details":{"connection_id":"conn-xyz","reason":"event_not_found","requested_id":"old-event-id","oldest_available":"evt-newer"}}
```

## Searching Logs

With structured JSON logs, you can easily search and filter:

```bash
# Find all stream opens
cat logs.json | jq 'select(.event == "stream.open")'

# Find all errors
cat logs.json | jq 'select(.level == "error")'

# Find logs for specific connection
cat logs.json | jq 'select(.details.connection_id == "conn-abc123")'

# Find resume failures
cat logs.json | jq 'select(.event | startswith("resume."))'
```

## Security Considerations (SSRK-180)

The logger automatically sanitizes sensitive data:

- Fields containing `password`, `token`, `secret`, `key`, `auth`, `credential` are redacted
- Long strings (>500 chars) are truncated
- Raw payload data is not logged in full

```json
{
  "ts": "...",
  "level": "error",
  "event": "parse.error",
  "message": "Parse error",
  "details": { "raw_preview": "data: {\"type\":\"domain.test..." }
}
```
