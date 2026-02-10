# SSE Event Envelope Examples

## Required Fields

All events MUST have these fields:
- `event_id`: UUIDv7 identifier
- `type`: Event type in dot-notation
- `ts`: ISO 8601 timestamp
- `payload`: Event data object

## Example Events

### 1. Normal Domain Event
```json
{
  "event_id": "0190a5e8-7c00-7000-8000-000000000001",
  "type": "domain.user.created",
  "ts": "2026-02-10T10:00:00.000Z",
  "payload": {
    "user_id": "usr_123",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "stream_id": "users",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
  "sequence": 42
}
```

### 2. Heartbeat Event
```json
{
  "event_id": "0190a5e8-7c01-7000-8000-000000000002",
  "type": "system.heartbeat",
  "ts": "2026-02-10T10:00:30.000Z",
  "payload": {}
}
```

### 3. Error Event
```json
{
  "event_id": "0190a5e8-7c02-7000-8000-000000000003",
  "type": "system.error",
  "ts": "2026-02-10T10:00:45.000Z",
  "payload": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests, please retry later"
  },
  "retry": 5000
}
```

### 4. Control Event (Open)
```json
{
  "event_id": "0190a5e8-7c03-7000-8000-000000000004",
  "type": "control.open",
  "ts": "2026-02-10T10:00:00.000Z",
  "payload": {
    "stream_id": "users",
    "server_version": "1.0.0"
  },
  "retry": 3000
}
```

### 5. Control Event (Reconnect)
```json
{
  "event_id": "0190a5e8-7c04-7000-8000-000000000005",
  "type": "control.reconnect",
  "ts": "2026-02-10T10:05:00.000Z",
  "payload": {
    "reason": "server_restart",
    "resume_from": "0190a5e8-7c00-7000-8000-000000000001"
  }
}
```

### 6. Minimal Valid Event
```json
{
  "event_id": "0190a5e8-7c05-7000-8000-000000000006",
  "type": "domain.ping",
  "ts": "2026-02-10T10:00:00.000Z",
  "payload": {}
}
```

## Reserved Event Types

| Type | Purpose |
|------|---------|
| `system.heartbeat` | Keep-alive signal |
| `system.error` | Error notification |
| `system.ack` | Acknowledgment |
| `control.open` | Connection established |
| `control.close` | Connection closing |
| `control.reconnect` | Reconnection instruction |

## Naming Rules

- **Reserved types**: Start with `system.` or `control.`
- **Domain events**: Use `domain.<entity>.<action>` format
- **All types**: Lowercase, dot-notation, alphanumeric only

## SSE Wire Format
```
id: 0190a5e8-7c00-7000-8000-000000000001
event: domain.user.created
retry: 3000
data: {"event_id":"0190a5e8-7c00-7000-8000-000000000001","type":"domain.user.created","ts":"2026-02-10T10:00:00.000Z","payload":{"user_id":"usr_123"}}
```
