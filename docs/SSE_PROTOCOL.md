# SSE Protocol Specification

**Version:** 1.0.0  
**Status:** Active  
**Last Updated:** 2026-02-10

---

## Table of Contents

1. [ST-01: Endpoint Contract](#st-01-endpoint-contract)
2. [ST-02: Ordering Guarantees](#st-02-ordering-guarantees)
3. [ST-03: Heartbeat Behavior](#st-03-heartbeat-behavior)
4. [ST-04: Resume Semantics](#st-04-resume-semantics)
5. [ST-05: Disconnect/Error Taxonomy](#st-05-disconnecterror-taxonomy)
6. [ST-06: State Machines](#st-06-state-machines)
7. [Implementation Checklist](#implementation-checklist)

---

## ST-01: Endpoint Contract

### Endpoint Path
```
GET /stream
GET /stream?last_event_id={id}
```

### Required Request Headers

| Header | Value | Required |
|--------|-------|----------|
| `Accept` | `text/event-stream` | Recommended |
| `Cache-Control` | `no-cache` | Recommended |
| `Last-Event-ID` | `{event_id}` | For resume |

### Required Response Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Type` | `text/event-stream` | SSE MIME type |
| `Cache-Control` | `no-cache` | Prevent caching |
| `Connection` | `keep-alive` | Persistent connection |
| `X-Accel-Buffering` | `no` | Disable proxy buffering |

### SSE Field Usage

| Field | Usage | Example |
|-------|-------|---------|
| `id` | Event ID for resume (UUIDv7) | `id: 0190a5e8-7c00-7000-8000-000000000001` |
| `event` | Event type | `event: domain.user.created` |
| `data` | JSON envelope | `data: {"event_id":"...","type":"..."}` |
| `retry` | Reconnect interval (ms) | `retry: 3000` |

### Wire Format Example
```
id: 0190a5e8-7c00-7000-8000-000000000001
event: domain.user.created
retry: 3000
data: {"event_id":"0190a5e8-7c00-7000-8000-000000000001","type":"domain.user.created","ts":"2026-02-10T10:00:00.000Z","payload":{"user_id":"123"}}
```

---

## ST-02: Ordering Guarantees

### Ordering Model: Best-Effort In-Order

Events are delivered **in-order within a single connection**. The server:

1. Sends events in the order they are produced
2. Uses `event_id` (UUIDv7) which is time-ordered
3. Optionally includes `sequence` for strict ordering within a stream

### Ordering Rules

| Rule | Description |
|------|-------------|
| **Single Connection** | Events arrive in send order |
| **After Reconnect** | Events replay from `Last-Event-ID` in order |
| **Across Streams** | No ordering guarantee between different `stream_id` values |

### Client Expectations

- Compare `event_id` values to detect ordering (UUIDv7 is lexicographically sortable)
- Use `sequence` field if present for strict ordering
- Handle duplicate events idempotently (same `event_id` = same event)

### Out-of-Order Handling

If client detects out-of-order events:

1. **Buffer briefly** (100-500ms) to allow reordering
2. **Process anyway** if business logic tolerates it
3. **Log for observability** but don't fail

---

## ST-03: Heartbeat Behavior

### Purpose

Heartbeats serve two purposes:
1. **Keep-alive**: Prevent proxies/load balancers from closing idle connections
2. **Liveness detection**: Let clients know the connection is still active

### Server Behavior

| Parameter | Default | Description |
|-----------|---------|-------------|
| `HEARTBEAT_INTERVAL` | 30 seconds | Time between heartbeats |

Server MUST:
- Send heartbeat if no other event sent within interval
- Use the standard event envelope format
- Include `type: system.heartbeat`

### Heartbeat Event Format
```
id: 0190a5e8-7c00-7000-8000-000000000001
event: system.heartbeat
data: {"event_id":"0190a5e8-7c00-7000-8000-000000000001","type":"system.heartbeat","ts":"2026-02-10T10:00:30.000Z","payload":{}}
```

### Client Behavior

| Parameter | Default | Description |
|-----------|---------|-------------|
| `CLIENT_TIMEOUT` | 45 seconds | Max time without any event |

Client MUST:
- Reset timeout timer on ANY event (including heartbeat)
- Consider connection dead if no event within `CLIENT_TIMEOUT`
- Initiate reconnection if timeout occurs

### Missed Heartbeat Detection
```
Timeline:
0s    - Event received, reset timer
30s   - Heartbeat expected
35s   - No heartbeat (network issue?)
45s   - CLIENT_TIMEOUT reached → reconnect
```

---

## ST-04: Resume Semantics (Last-Event-ID)

### Purpose

Allow clients to resume from where they left off after disconnection.

### Protocol Flow
```
1. Client connects:
   GET /stream
   
2. Server sends events with IDs:
   id: event-001
   id: event-002
   id: event-003  ← Client receives this, then disconnects
   
3. Client reconnects with Last-Event-ID:
   GET /stream
   Last-Event-ID: event-003
   
4. Server replays events AFTER event-003:
   id: event-004
   id: event-005
   ...
```

### Server Requirements

| Requirement | Description |
|-------------|-------------|
| **Store events** | Keep recent events in buffer (memory/Redis) |
| **Honor Last-Event-ID** | Replay events after the given ID |
| **Limit replay** | Max 1000 events or 5 minutes, whichever is less |
| **Signal gaps** | Send `control.reconnect` if events are unavailable |

### Client Requirements

| Requirement | Description |
|-------------|-------------|
| **Track last ID** | Store most recent `id` field value |
| **Send on reconnect** | Include `Last-Event-ID` header |
| **Handle gaps** | Process `control.reconnect` with `resume_from` |

### Gap Handling

If server cannot replay from requested ID:
```
id: 0190a5e8-8000-7000-8000-000000000001
event: control.reconnect
data: {"event_id":"...","type":"control.reconnect","ts":"...","payload":{"reason":"events_expired","resume_from":"0190a5e8-7f00-7000-8000-000000000001","gap_start":"event-003","gap_end":"0190a5e8-7f00-7000-8000-000000000001"}}
```

Client should:
1. Log the gap for observability
2. Continue processing from new position
3. Optionally fetch missed data via REST API

---

## ST-05: Disconnect/Error Taxonomy

### Disconnect Reasons

| Code | Initiator | Description |
|------|-----------|-------------|
| `client_close` | Client | Client called `close()` |
| `client_abort` | Client | Browser/tab closed |
| `client_timeout` | Client | No data received in time |
| `server_shutdown` | Server | Graceful shutdown |
| `server_restart` | Server | Server restarting |
| `server_error` | Server | Unhandled exception |
| `idle_timeout` | Server | No activity timeout |
| `network_error` | Network | Connection lost |
| `overload_reject` | Server | Server too busy (503) |
| `rate_limited` | Server | Too many requests (429) |
| `auth_expired` | Server | Token expired (401) |
| `stream_ended` | Server | Normal completion |
| `parse_error` | Either | Malformed data |
| `invalid_event` | Either | Schema validation failed |

### Error Event Format
```json
{
  "event_id": "0190a5e8-7c00-7000-8000-000000000001",
  "type": "system.error",
  "ts": "2026-02-10T10:00:00.000Z",
  "payload": {
    "code": "rate_limited",
    "message": "Too many requests, retry after 60 seconds",
    "retry_after": 60000
  },
  "retry": 60000
}
```

---

## ST-06: State Machines

### Client State Machine
```
                    ┌─────────────┐
                    │  CONNECTING │
                    └──────┬──────┘
                           │ onopen
                           ▼
    ┌──────────────────────────────────────┐
    │               OPEN                    │
    │  - Receiving events                   │
    │  - Reset timeout on each event        │
    └──────────────────┬───────────────────┘
                       │ onerror / timeout
                       ▼
              ┌─────────────────┐
              │    RETRYING     │◄─────────┐
              │  - Wait retry   │          │
              │  - Attempt conn │──────────┘
              └────────┬────────┘  failed (retry < max)
                       │
                       │ failed (retry >= max) OR close()
                       ▼
                ┌─────────────┐
                │   CLOSED    │
                └─────────────┘
```

### Client State Transitions

| From | To | Trigger |
|------|----|---------|
| `CONNECTING` | `OPEN` | Connection established |
| `CONNECTING` | `RETRYING` | Connection failed |
| `OPEN` | `RETRYING` | Error or timeout |
| `OPEN` | `CLOSED` | Client calls `close()` |
| `RETRYING` | `OPEN` | Reconnection successful |
| `RETRYING` | `CLOSED` | Max retries exceeded |

### Server Stream State Machine
```
    ┌───────────────┐
    │ INITIALIZING  │
    └───────┬───────┘
            │ ready
            ▼
    ┌───────────────┐
    │   STREAMING   │◄──────┐
    └───────┬───────┘       │
            │               │ backpressure relieved
            │ backpressure  │
            ▼               │
    ┌───────────────┐       │
    │    PAUSED     │───────┘
    └───────┬───────┘
            │ shutdown signal
            ▼
    ┌───────────────┐
    │   DRAINING    │
    └───────┬───────┘
            │ all sent / timeout
            ▼
    ┌───────────────┐
    │    CLOSED     │
    └───────────────┘
```

### Server State Transitions

| From | To | Trigger |
|------|----|---------|
| `INITIALIZING` | `STREAMING` | Setup complete |
| `STREAMING` | `PAUSED` | Backpressure detected |
| `PAUSED` | `STREAMING` | Backpressure relieved |
| `STREAMING` | `DRAINING` | Shutdown signal |
| `PAUSED` | `DRAINING` | Shutdown signal |
| `DRAINING` | `CLOSED` | All events sent or timeout |

---

## Implementation Checklist

### Server Implementation

- [ ] **ST-01**: Endpoint returns correct headers
- [ ] **ST-01**: Events use `id`, `event`, `data` fields correctly
- [ ] **ST-02**: Events sent in order
- [ ] **ST-03**: Heartbeats sent every 30s (configurable)
- [ ] **ST-04**: `Last-Event-ID` header honored
- [ ] **ST-04**: Events replayed after requested ID
- [ ] **ST-04**: Gap signaled via `control.reconnect`
- [ ] **ST-05**: Errors use taxonomy codes
- [ ] **ST-06**: State machine implemented

### Client Implementation

- [ ] **ST-01**: Sends correct request headers
- [ ] **ST-01**: Parses `id`, `event`, `data` fields
- [ ] **ST-02**: Handles events in order
- [ ] **ST-02**: Detects duplicates by `event_id`
- [ ] **ST-03**: Resets timeout on any event
- [ ] **ST-03**: Reconnects on timeout (45s default)
- [ ] **ST-04**: Tracks last received `id`
- [ ] **ST-04**: Sends `Last-Event-ID` on reconnect
- [ ] **ST-04**: Handles `control.reconnect` gaps
- [ ] **ST-05**: Logs disconnect reasons
- [ ] **ST-06**: State machine implemented

---

## References

- [HTML Living Standard - Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN - Using Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
