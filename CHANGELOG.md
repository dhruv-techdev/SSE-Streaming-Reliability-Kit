# Changelog

All notable changes to the SSE Streaming Reliability Kit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [1.0.0] - 2024-XX-XX

**Initial GA Release**

### Added

#### Core Protocol (US-01 to US-04)

- Event envelope schema with `event_id`, `type`, `ts`, `sequence`, `payload` fields
- UUIDv7-based event ID generation with embedded timestamps
- Reserved event types: `system.heartbeat`, `system.error`, `control.*`
- Fastify-based SSE reference server with connection registry
- Node.js SSE client connector with event parsing and callbacks

#### Reconnection Features (US-05 to US-10)

- Exponential backoff retry policy with configurable jitter
- Connection state machine: idle → connecting → open → retrying → closed
- Auto-reconnection with configurable retry limits
- Circuit breaker with max attempts and max retry time
- Heartbeat/keepalive with configurable intervals
- Liveness detection via heartbeat monitoring with grace period

#### Resume Support (US-11 to US-15)

- Last-Event-ID tracking with pluggable storage (memory, file, localStorage)
- Server-side replay buffer with bounded size and TTL
- Bounded replay with max batch size and truncation signals
- Cannot-resume signal with reason codes (buffer_expired, event_not_found)
- Client fallback behaviors: start_fresh, close, callback

#### Observability (US-16 to US-21)

- Client-side duplicate detection with bounded LRU cache
- Ordering enforcement with configurable rules (sequence, event_id, timestamp)
- Server metrics: active_streams, disconnects, heartbeats, replays, cannot_resume
- Client metrics: reconnects, resume success/failure, event lag, liveness failures
- Structured JSON logging with consistent schema
- Correlation IDs: stream_id (server-generated) and trace_id (client-provided)

#### Testing & CI (US-22 to US-24)

- Fault injection test harness with scenario DSL
- Pre-built scenarios: drop-mid-stream, server-restart, liveness, dedupe, cannot-resume
- Assertion API for scenario validation
- GitHub Actions CI pipeline with lint, format, test, and harness gates
- PR template with checklist

#### Documentation (US-25 to US-28)

- Comprehensive README with 5-minute quickstart
- Configuration reference documentation
- Metrics and logging guides
- Operational runbook with failure modes and recovery playbooks
- Requirements traceability matrix
- Release checklist

### Requirements Coverage

| Milestone         | User Stories   | Requirements         | Tests    |
| ----------------- | -------------- | -------------------- | -------- |
| M1: Baseline      | US-01 to US-04 | SSRK-001 to SSRK-040 | 80+      |
| M2: Reconnection  | US-05 to US-15 | SSRK-041 to SSRK-145 | 150+     |
| M3: Observability | US-16 to US-21 | SSRK-146 to SSRK-190 | 100+     |
| M4: CI/Release    | US-22 to US-28 | SSRK-191 to SSRK-243 | 50+      |
| **Total**         | **28**         | **243**              | **380+** |

### Breaking Changes

N/A - Initial release

### Deprecations

N/A - Initial release

### Security

- Sensitive field redaction in structured logs (password, token, secret, key, auth, credential)
- Trace ID validation to prevent injection attacks
- No external network calls from client (except to configured SSE endpoint)

### Known Limitations

See [docs/RUNBOOK.md#known-limitations](docs/RUNBOOK.md#known-limitations):

1. Replay buffer is in-memory (lost on server restart)
2. No guaranteed delivery beyond buffer TTL
3. Single server instance limitation (no built-in pub/sub)
4. Ordering may have gaps after resume
5. Browser usage requires polyfills
6. Recommended event size < 16KB
7. Browser SSE connection limits apply

---

## Version History

| Version | Date | Highlights                                    |
| ------- | ---- | --------------------------------------------- |
| 1.0.0   | TBD  | Initial GA release - full reliability toolkit |

---

[Unreleased]: https://github.com/your-org/sse-streaming-reliability-kit/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/sse-streaming-reliability-kit/releases/tag/v1.0.0
