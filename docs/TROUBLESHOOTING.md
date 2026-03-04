# Troubleshooting Decision Tree

Use this guide to quickly diagnose and resolve issues.

## Client Not Receiving Events

```
Client not receiving events
│
├─ Is client connected?
│  ├─ NO → Check connector.getState()
│  │       └─ State is 'retrying' → Check server availability
│  │       └─ State is 'closed' → Check connector.hasGivenUp
│  │       └─ State is 'idle' → Call connector.connect()
│  │
│  └─ YES → Continue...
│
├─ Are events being sent? (Check server metrics)
│  └─ NO → Check server is emitting events
│  └─ YES → Continue...
│
├─ Are events being received? (Check eventsReceived stat)
│  └─ NO → Network issue, check logs for errors
│  └─ YES → Continue...
│
├─ Are events being processed? (Check eventsProcessed stat)
│  └─ NO → Check duplicatesIgnored, outOfOrderDropped
│  │       └─ High duplicates → Dedupe cache issue
│  │       └─ High out-of-order → Ordering issue
│  └─ YES → Check onEvent callback
│
└─ onEvent not firing → Check callback is registered
```

## Reconnection Loop

```
Client reconnecting repeatedly
│
├─ Check disconnect reason in onClose
│  ├─ 'network_error' → Network instability
│  ├─ 'heartbeat_missed' → Server not sending heartbeats
│  ├─ 'server_close' → Server closing connections
│  └─ 'client_abort' → Client-side issue
│
├─ Check server logs for stream.close events
│
├─ Check liveness settings
│  └─ livenessTimeoutMs too low → Increase timeout
│
└─ Check server heartbeat interval
   └─ Ensure client timeout > server heartbeat interval
```

## Cannot Resume

```
Cannot resume after reconnect
│
├─ Check server buffer stats
│  └─ curl http://localhost:3000/health | jq '.buffer'
│
├─ Is requested event in buffer?
│  └─ NO → Event expired or server restarted
│      └─ Increase SSE_MAX_BUFFER_SIZE
│      └─ Increase SSE_BUFFER_TTL_MS
│
├─ Check disconnect duration
│  └─ If > buffer TTL, events will expire
│
└─ Check cannot_resume reason in logs
   └─ 'event_not_found' → Event no longer in buffer
   └─ 'buffer_expired' → TTL exceeded
```

## High Latency

```
Events arriving late (high lag)
│
├─ Check client lag stats
│  └─ connector.getStats().lag
│
├─ Is server overloaded?
│  └─ Check CPU, memory, active connections
│
├─ Is network slow?
│  └─ Check with ping, traceroute
│
├─ Is client processing slow?
│  └─ Add timing to onEvent callback
│
└─ Is there event backlog?
   └─ Check server event queue depth
```

## Memory Issues

```
Server memory growing
│
├─ Check buffer size
│  └─ curl http://localhost:3000/health | jq '.buffer.size'
│  └─ If at max → Working correctly
│  └─ If growing beyond max → Bug, report it
│
├─ Check connection count
│  └─ curl http://localhost:3000/metrics | grep active_streams
│  └─ Compare to streams_opened - disconnect count
│  └─ Mismatch → Connection leak
│
└─ Check for large payloads
   └─ Review event payload sizes
   └─ Reduce payload size
```
