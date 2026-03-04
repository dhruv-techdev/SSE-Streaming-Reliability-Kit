# SSE Reliability Kit - Quick Reference Card

## Health Checks

```bash
curl http://localhost:3000/health    # Server health
curl http://localhost:3000/metrics   # Prometheus metrics
curl http://localhost:3000/info      # Server info
```

## Key Metrics

| Metric                                      | Watch For                 |
| ------------------------------------------- | ------------------------- |
| `active_streams`                            | Expected connection count |
| `rejected_connections_total`                | > 0 = capacity issue      |
| `disconnects_total{reason="network_error"}` | Spike = network issue     |
| `cannot_resume_total`                       | High = buffer too small   |
| `event_lag_ms` p95                          | > 500ms = latency issue   |

## Common Issues

| Symptom             | Check                                    | Fix                             |
| ------------------- | ---------------------------------------- | ------------------------------- |
| 503 errors          | `MAX_CONNECTIONS`                        | Increase limit or scale         |
| Events missing      | `duplicatesIgnored`, `outOfOrderDropped` | Check dedupe/ordering config    |
| Frequent reconnects | `livenessFailures`, disconnect reasons   | Check network, heartbeat config |
| Cannot resume       | Buffer size, TTL                         | Increase `SSE_MAX_BUFFER_SIZE`  |
| Client gave up      | Retry policy                             | Increase `maxAttempts`          |

## Log Filtering

```bash
# Errors only
cat server.log | jq 'select(.level == "error")'

# By stream
cat server.log | jq 'select(.stream_id == "STREAM_ID")'

# By event type
cat server.log | jq 'select(.event == "stream.close")'

# Resume issues
cat server.log | jq 'select(.event | startswith("resume."))'
```

## Client Debug

```javascript
connector.getStats(); // All stats
connector.getState(); // Current state
connector.hasGivenUp; // Gave up?
connector.serverStreamId; // Stream ID
connector.setDebug(true); // Enable debug logging
```

## Server Config

```bash
PORT=3000
SSE_HEARTBEAT_INTERVAL=15000
SSE_MAX_BUFFER_SIZE=1000
MAX_CONNECTIONS=1000
LOG_LEVEL=info
```

## Recovery Actions

```bash
# Restart with more buffer
SSE_MAX_BUFFER_SIZE=5000 npm run server

# Restart with lower connection limit
MAX_CONNECTIONS=500 npm run server

# Client: restart after give-up
connector.restart()

# Client: start fresh (clear state)
connector.startFresh()
```
