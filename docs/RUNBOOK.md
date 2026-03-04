# SSE Streaming Reliability Kit - Operational Runbook

This runbook provides operational guidance for running and troubleshooting the SSE Streaming Reliability Kit in production.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Common Failure Modes & Symptoms](#common-failure-modes--symptoms)
3. [Metrics Interpretation Guide](#metrics-interpretation-guide)
4. [Log Interpretation & Correlation](#log-interpretation--correlation)
5. [Recovery Playbooks](#recovery-playbooks)
6. [Known Limitations](#known-limitations)
7. [Escalation Procedures](#escalation-procedures)

---

## Quick Reference

### Health Check Endpoints

| Endpoint       | Purpose             | Expected Response |
| -------------- | ------------------- | ----------------- |
| `GET /health`  | Server health       | `{"status":"ok"}` |
| `GET /metrics` | Prometheus metrics  | Text format       |
| `GET /info`    | Server info & stats | JSON with config  |

### Key Metrics to Monitor

| Metric                                                 | Alert Threshold   | Description            |
| ------------------------------------------------------ | ----------------- | ---------------------- |
| `sse_server_active_streams`                            | < 1 (if expected) | Active connections     |
| `sse_server_rejected_connections_total`                | > 0 sustained     | Capacity issues        |
| `sse_server_disconnects_total{reason="network_error"}` | Spike             | Network problems       |
| `sse_client_reconnect_attempts_total`                  | High rate         | Connection instability |
| `sse_client_liveness_failures_total`                   | > 0               | Heartbeat issues       |

### Quick Commands

```bash
# Check server health
curl http://localhost:3000/health

# View Prometheus metrics
curl http://localhost:3000/metrics

# View server info
curl http://localhost:3000/info

# Tail server logs (JSON)
tail -f server.log | jq .

# Filter logs by stream_id
cat server.log | jq 'select(.stream_id == "stream-abc123")'

# Run diagnostic scenario
npm run harness run drop-mid-stream
```

---

## Common Failure Modes & Symptoms (SSRK-233)

### 1. Connection Rejected (503)

**Symptoms:**

- Clients receive HTTP 503
- `sse_server_rejected_connections_total` increasing
- Logs show `stream.reject` events

**Possible Causes:**

- Max connections reached (`MAX_CONNECTIONS`)
- Server shutting down
- Resource exhaustion

**Diagnosis:**

```bash
# Check active connections
curl -s http://localhost:3000/health | jq '.connections'

# Check rejection metric
curl -s http://localhost:3000/metrics | grep rejected

# Check server logs
cat server.log | jq 'select(.event == "stream.reject")'
```

---

### 2. Clients Not Receiving Events

**Symptoms:**

- `onEvent` callback not firing
- Events show in server logs but not client
- Connection appears open

**Possible Causes:**

- Events failing validation
- Ordering guard dropping events
- Dedupe cache false positives
- Network buffering/proxy issues

**Diagnosis:**

```bash
# Check client stats
connector.getStats()
# Look at: eventsReceived vs eventsProcessed, duplicatesIgnored, outOfOrderDropped

# Check server event send count
curl -s http://localhost:3000/metrics | grep events_sent

# Enable debug logging
connector.setDebug(true)
```

---

### 3. Frequent Reconnections

**Symptoms:**

- `reconnectCount` continuously increasing
- `sse_client_reconnect_attempts_total` high
- `onClose` firing repeatedly

**Possible Causes:**

- Network instability
- Server restarts
- Load balancer timeouts
- Heartbeat/liveness failures

**Diagnosis:**

```bash
# Check reconnect stats
connector.getStats().reconnectCount

# Check disconnect reasons (server-side)
curl -s http://localhost:3000/metrics | grep disconnects_total

# Check liveness failures (client-side)
connector.getStats().livenessFailures
```

---

### 4. Cannot Resume (Events Lost)

**Symptoms:**

- `onCannotResume` callback fires
- Client receives `control.cannot_resume`
- Gap in event sequence after reconnect

**Possible Causes:**

- Replay buffer too small
- Buffer TTL too short
- Long disconnect duration
- Server restart (buffer lost)

**Diagnosis:**

```bash
# Check buffer stats
curl -s http://localhost:3000/health | jq '.buffer'

# Check cannot-resume metric
curl -s http://localhost:3000/metrics | grep cannot_resume

# Check server logs
cat server.log | jq 'select(.event == "resume.cannot_resume")'
```

---

### 5. High Event Lag

**Symptoms:**

- `sse_client_event_lag_ms` p95/p99 increasing
- Events arriving late
- Application processing delays

**Possible Causes:**

- Server overloaded
- Network latency
- Client processing slow
- Event queue backup

**Diagnosis:**

```bash
# Check client lag stats
connector.getStats().lag

# Check server-side timing
curl -s http://localhost:3000/metrics | grep -E "events_sent|heartbeats"

# Profile event handler
# Wrap onEvent with timing
```

---

### 6. Memory Growth (Server)

**Symptoms:**

- Server memory increasing over time
- Eventually OOM or slowdown

**Possible Causes:**

- Replay buffer unbounded
- Connection leak (cleanup not running)
- Large event payloads accumulating

**Diagnosis:**

```bash
# Check buffer size
curl -s http://localhost:3000/health | jq '.buffer.size'

# Check active vs total connections
curl -s http://localhost:3000/metrics | grep -E "active_streams|streams_opened"

# Check Node.js memory
node --expose-gc -e "console.log(process.memoryUsage())"
```

---

### 7. Heartbeat Failures

**Symptoms:**

- `sse_server_heartbeats_failed_total` > 0
- Clients disconnecting unexpectedly
- `onLivenessFailure` firing on clients

**Possible Causes:**

- Network issues
- Server overloaded (can't send heartbeats)
- Client timeout too aggressive

**Diagnosis:**

```bash
# Check heartbeat metrics
curl -s http://localhost:3000/metrics | grep heartbeat

# Check server logs for heartbeat errors
cat server.log | jq 'select(.event == "heartbeat.failed")'

# Check client liveness config
connector.options.livenessTimeoutMs
```

---

### 8. Client Give-Up

**Symptoms:**

- `onGiveUp` callback fires
- Client stops trying to reconnect
- `hasGivenUp` returns true

**Possible Causes:**

- Max retry attempts exceeded
- Max retry time exceeded
- Persistent server unavailability

**Diagnosis:**

```bash
# Check client state
connector.hasGivenUp  // true
connector.getStats().giveUpReason

# Check retry policy
connector.getRetryPolicy()

# Restart client manually
connector.restart()
```

---

## Metrics Interpretation Guide (SSRK-234)

### Server Metrics

#### `sse_server_active_streams` (Gauge)

**What it means:** Current number of open SSE connections.

**Healthy range:** Depends on expected load. Should be stable during normal operation.

**Alerts:**

- `== 0` when expecting traffic → No clients connected
- `== MAX_CONNECTIONS` → At capacity, new connections rejected
- Rapid oscillation → Connection instability

---

#### `sse_server_streams_opened_total` (Counter)

**What it means:** Total connections since server start.

**Interpretation:**

- Rate = new connections per second
- High rate + stable active_streams = normal churn
- High rate + low active_streams = clients can't stay connected

---

#### `sse_server_disconnects_total{reason="..."}` (Counter)

**What it means:** Disconnection count by reason.

| Reason             | Meaning               | Action                 |
| ------------------ | --------------------- | ---------------------- |
| `client_close`     | Normal disconnect     | Expected               |
| `client_abort`     | Client crashed/killed | Check client health    |
| `network_error`    | Network issue         | Check network          |
| `server_shutdown`  | Graceful shutdown     | Expected during deploy |
| `heartbeat_missed` | Client didn't respond | Check client load      |

---

#### `sse_server_rejected_connections_total` (Counter)

**What it means:** Connections rejected due to capacity.

**Healthy:** 0 or very low

**If increasing:**

1. Check `MAX_CONNECTIONS` setting
2. Check for connection leaks
3. Scale horizontally

---

#### `sse_server_heartbeats_sent_total` / `heartbeats_failed_total` (Counter)

**What it means:** Heartbeat health.

**Healthy:** sent increasing, failed = 0

**Failure rate formula:** `failed / sent * 100`

**If failure rate > 1%:** Investigate network or server load

---

#### `sse_server_replays_attempted_total` / `succeeded_total` / `failed_total` (Counter)

**What it means:** Resume behavior.

**Success rate formula:** `succeeded / attempted * 100`

**If success rate < 90%:**

1. Increase `SSE_MAX_BUFFER_SIZE`
2. Decrease `SSE_BUFFER_TTL_MS` less aggressively
3. Check reconnection patterns

---

### Client Metrics

#### `sse_client_reconnect_attempts_total{reason="..."}` (Counter)

**What it means:** Reconnection attempts by trigger.

**High counts indicate:**

- Network instability
- Server issues
- Aggressive timeout settings

---

#### `sse_client_resume_success_total` / `resume_failure_total` (Counter)

**What it means:** Resume effectiveness.

**Target:** > 95% success rate

**If low:**

- Server buffer too small
- Disconnects too long
- Server restarts clearing buffer

---

#### `sse_client_duplicate_events_total` (Counter)

**What it means:** Duplicates detected and dropped.

**Healthy:** Low count, stable

**If high:**

- Replay sending already-seen events
- Network causing retransmission

---

#### `sse_client_event_lag_ms` (Histogram)

**What it means:** Time between event creation and client receipt.

**Healthy ranges:**

- p50 < 100ms
- p95 < 500ms
- p99 < 1000ms

**If high:**

- Server overloaded
- Network latency
- Client processing slow

---

## Log Interpretation & Correlation (SSRK-235)

### Log Schema

All logs follow this JSON structure:

```json
{
  "ts": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "component": "server",
  "event": "stream.open",
  "message": "Stream opened: stream-abc123",
  "stream_id": "stream-abc123",
  "trace_id": "trace-xyz789",
  "details": { ... }
}
```

### Tracing a Single Stream End-to-End

#### Step 1: Find the stream_id

From server logs:

```bash
cat server.log | jq 'select(.event == "stream.connect")' | head -1
# Note the stream_id
```

From client:

```javascript
connector.serverStreamId; // "stream-abc123"
```

#### Step 2: Filter all logs for that stream

```bash
# Server-side
cat server.log | jq 'select(.stream_id == "stream-abc123")'

# Client-side
cat client.log | jq 'select(.stream_id == "stream-abc123")'
```

#### Step 3: Reconstruct timeline

```bash
# Combine and sort by timestamp
cat server.log client.log | jq -s 'sort_by(.ts)' | jq '.[] | select(.stream_id == "stream-abc123")'
```

### Using trace_id for Distributed Tracing

If the client provides a trace_id:

```javascript
const connector = connectSSE(url, {
  traceId: 'my-trace-123',
});
```

All server logs and events will include this trace_id:

```bash
# Find all logs for a trace
cat server.log | jq 'select(.trace_id == "my-trace-123")'
```

### Key Log Events to Monitor

| Event                  | Level | Meaning                 |
| ---------------------- | ----- | ----------------------- |
| `stream.connect`       | info  | Client connecting       |
| `stream.open`          | info  | Connection established  |
| `stream.close`         | info  | Connection closed       |
| `stream.reject`        | warn  | Connection rejected     |
| `resume.attempt`       | info  | Client trying to resume |
| `resume.success`       | info  | Resume succeeded        |
| `resume.cannot_resume` | warn  | Resume failed           |
| `heartbeat.failed`     | error | Heartbeat send failed   |
| `parse.error`          | error | Invalid event data      |

### Example: Debugging a Failed Resume

```bash
# Find the resume attempt
cat server.log | jq 'select(.event | startswith("resume."))'

# Expected sequence:
# 1. resume.attempt - Client sent Last-Event-ID
# 2. resume.cannot_resume OR resume.success
# 3. If cannot_resume: check requested_id vs oldest_available

# Example output:
# {"event":"resume.attempt","stream_id":"stream-abc","details":{"last_event_id":"evt-old"}}
# {"event":"resume.cannot_resume","stream_id":"stream-abc","details":{"requested_id":"evt-old","oldest_available":"evt-newer"}}
```

---

## Recovery Playbooks (SSRK-236)

### Playbook 1: Server Overloaded (High CPU/Memory)

**Symptoms:**

- High CPU/memory usage
- Slow response times
- Connections timing out

**Steps:**

1. **Check current load**

```bash
   curl -s http://localhost:3000/health | jq '.'
```

2. **Reduce connection limit temporarily**

```bash
   # Restart with lower limit
   MAX_CONNECTIONS=500 npm run server
```

3. **Identify heavy streams**

```bash
   # Check for streams receiving many events
   cat server.log | jq '.stream_id' | sort | uniq -c | sort -rn | head
```

4. **Scale horizontally** (if available)

```bash
   # Add more server instances behind load balancer
```

5. **Increase resources**

```bash
   # Increase Node.js heap
   NODE_OPTIONS="--max-old-space-size=4096" npm run server
```

---

### Playbook 2: All Clients Disconnected

**Symptoms:**

- `sse_server_active_streams` = 0
- No client connections

**Steps:**

1. **Verify server is reachable**

```bash
   curl -v http://localhost:3000/health
```

2. **Check for network issues**

```bash
   # Check firewall, load balancer, DNS
```

3. **Check server logs for errors**

```bash
   cat server.log | jq 'select(.level == "error")' | tail -20
```

4. **Verify SSE endpoint works**

```bash
   curl -N http://localhost:3000/stream
   # Should receive events
```

5. **Check client-side logs**

```bash
   # Look for connection errors, give-up events
```

---

### Playbook 3: High Cannot-Resume Rate

**Symptoms:**

- `sse_server_cannot_resume_total` increasing
- Clients losing events after reconnect

**Steps:**

1. **Check buffer stats**

```bash
   curl -s http://localhost:3000/health | jq '.buffer'
```

2. **Increase buffer size**

```bash
   SSE_MAX_BUFFER_SIZE=5000 npm run server
```

3. **Increase buffer TTL**

```bash
   SSE_BUFFER_TTL_MS=600000 npm run server  # 10 minutes
```

4. **Check disconnect duration**

```bash
   # If clients are disconnected for > buffer TTL, buffer will expire
   # Consider: faster reconnection, or persistent storage
```

5. **Consider persistent replay buffer**

```bash
   # Implement Redis/DB-backed buffer for production
```

---

### Playbook 4: Client Giving Up Too Quickly

**Symptoms:**

- `onGiveUp` firing after few attempts
- Clients not retrying long enough

**Steps:**

1. **Check retry policy**

```javascript
connector.getRetryPolicy();
```

2. **Increase max attempts**

```javascript
const connector = connectSSE(url, {
  retryPolicy: {
    maxAttempts: 20, // Increase from default
    maxRetryTimeMs: 600000, // 10 minutes
  },
});
```

3. **Check if server is actually reachable**

```bash
   curl -v http://localhost:3000/health
```

4. **Restart client**

```javascript
connector.restart(); // Reset give-up state
```

---

### Playbook 5: Events Arriving Out of Order

**Symptoms:**

- `onOutOfOrder` callback firing
- Events being dropped
- Sequence gaps in processed events

**Steps:**

1. **Check ordering stats**

```javascript
connector.getStats().outOfOrderDropped;
connector.getOrderingGuard().getStats();
```

2. **Verify server is sending in order**

```bash
   # Events should have increasing sequence numbers
   cat server.log | jq 'select(.type | startswith("domain."))' | jq '.sequence'
```

3. **If out-of-order is expected, disable enforcement**

```javascript
const connector = connectSSE(url, {
  enableOrdering: false,
  // OR
  orderingRule: OrderingRule.NONE,
});
```

4. **Accept out-of-order events**

```javascript
const connector = connectSSE(url, {
  outOfOrderPolicy: OutOfOrderPolicy.ACCEPT,
});
```

---

### Playbook 6: Memory Leak Investigation

**Symptoms:**

- Server memory growing unboundedly
- Eventually OOM or severe slowdown

**Steps:**

1. **Take heap snapshot**

```bash
   # Send SIGUSR2 to Node.js process
   kill -USR2 <pid>
```

2. **Check buffer size**

```bash
   curl -s http://localhost:3000/health | jq '.buffer.size'
   # Should be <= SSE_MAX_BUFFER_SIZE
```

3. **Check connection count**

```bash
   curl -s http://localhost:3000/metrics | grep active_streams
   # Should match expected clients
```

4. **Verify cleanup on disconnect**

```bash
   cat server.log | jq 'select(.event == "stream.close")' | wc -l
   # Should match stream.open count minus active
```

5. **Restart server with limits**

```bash
   SSE_MAX_BUFFER_SIZE=1000 MAX_CONNECTIONS=500 npm run server
```

---

## Known Limitations (SSRK-237)

### 1. Replay Buffer is In-Memory

**Impact:** Buffer is lost on server restart. Clients that reconnect after restart cannot resume.

**Mitigation:**

- Keep restarts short during low-traffic periods
- Clients handle `cannot_resume` gracefully
- Consider implementing persistent buffer (Redis/DB)

**Configuration:**

```bash
SSE_MAX_BUFFER_SIZE=1000  # Adjust based on memory
```

---

### 2. No Guaranteed Delivery

**Impact:** If a client is disconnected longer than buffer TTL, events are lost.

**Mitigation:**

- Increase buffer size and TTL for critical streams
- Implement application-level acknowledgment
- Use event sourcing with persistent store

**Configuration:**

```bash
SSE_MAX_BUFFER_SIZE=5000
SSE_BUFFER_TTL_MS=600000  # 10 minutes
```

---

### 3. Single Server Instance Limitation

**Impact:** Clients connected to different servers won't receive each other's events.

**Mitigation:**

- Use pub/sub (Redis) between servers
- Sticky sessions at load balancer
- Implement distributed replay buffer

---

### 4. Ordering Not Guaranteed Across Reconnects

**Impact:** After resume, replayed events maintain order, but sequence numbers may have gaps.

**Mitigation:**

- Application should handle gaps gracefully
- Use idempotent event handlers
- Track processed events in application

---

### 5. Browser Compatibility

**Impact:** Client module is designed for Node.js. Browser usage requires polyfills.

**Mitigation:**

- Use native `EventSource` in browsers
- Bundle with appropriate Node.js polyfills
- Consider separate browser-optimized client

---

### 6. Maximum Event Size

**Impact:** Very large events (> 64KB) may cause issues with some proxies/networks.

**Mitigation:**

- Keep events small (< 16KB recommended)
- Split large data across multiple events
- Use event references instead of full data

---

### 7. Connection Limits per Browser

**Impact:** Browsers limit SSE connections to ~6 per domain.

**Mitigation:**

- Use single SSE connection with multiplexed events
- Use different subdomains for different streams
- Consider WebSockets for many-channel scenarios

---

## Escalation Procedures

### Severity Levels

| Level | Description     | Response Time | Examples                             |
| ----- | --------------- | ------------- | ------------------------------------ |
| P1    | Complete outage | 15 minutes    | All streams down, server crash       |
| P2    | Partial outage  | 1 hour        | High error rate, cannot-resume spike |
| P3    | Degraded        | 4 hours       | Elevated latency, some failures      |
| P4    | Minor issue     | 24 hours      | Cosmetic, non-impacting              |

### Escalation Contacts

| Role             | Contact                | When to Escalate      |
| ---------------- | ---------------------- | --------------------- |
| On-Call Engineer | [oncall@example.com]   | P1, P2                |
| Team Lead        | [teamlead@example.com] | P1 unresolved > 30min |
| SRE Team         | [sre@example.com]      | Infrastructure issues |

### Information to Gather Before Escalating

1. **Symptoms:** What's broken? Error messages?
2. **Timeline:** When did it start? Any changes?
3. **Scope:** All clients? Specific clients? Percentage?
4. **Metrics:** Key metric values at time of issue
5. **Logs:** Relevant log snippets (with stream_id/trace_id)
6. **Actions Taken:** What you've tried so far

### Post-Incident

1. Create incident report
2. Update runbook with new learnings
3. Add missing alerts/monitoring
4. Schedule post-mortem if P1/P2

---

## Appendix: Quick Diagnostic Commands

```bash
# Server health check
curl -s http://localhost:3000/health | jq '.'

# Key metrics summary
curl -s http://localhost:3000/metrics | grep -E "active_streams|rejected|disconnects|cannot_resume"

# Recent errors
cat server.log | jq 'select(.level == "error")' | tail -10

# Connection timeline for specific stream
cat server.log | jq 'select(.stream_id == "STREAM_ID") | {ts, event, message}'

# Buffer status
curl -s http://localhost:3000/health | jq '.buffer'

# Client stats
# (Run in client context)
JSON.stringify(connector.getStats(), null, 2)
```

---

_Last updated: 2024-XX-XX_
_Version: 1.0.0_
