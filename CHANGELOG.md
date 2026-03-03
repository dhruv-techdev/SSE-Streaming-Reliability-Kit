# Changelog

All notable changes to the SSE Streaming Reliability Kit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- (Changes that add new features go here)

### Changed

- (Changes that modify existing features go here)

### Deprecated

- (Features that will be removed in future versions go here)

### Removed

- (Features that were removed go here)

### Fixed

- (Bug fixes go here)

### Security

- (Security-related fixes go here)

---

## [1.0.0] - 2024-XX-XX

### Added

#### Core Protocol

- Event envelope schema with `event_id`, `type`, `ts`, `sequence`, `payload`
- UUIDv7-based event ID generation with timestamp extraction
- Reserved event types: `system.heartbeat`, `system.error`, `control.*`

#### Server Features

- Fastify-based SSE server with connection registry
- Configurable heartbeat scheduler
- Replay buffer with bounded size and TTL
- Last-Event-ID resume support
- Cannot-resume signal when buffer expired
- Prometheus-compatible metrics endpoint (`/metrics`)
- Structured JSON logging with correlation IDs

#### Client Features

- State machine-driven connection management
- Exponential backoff with jitter retry policy
- Circuit breaker with max attempts and time limits
- Liveness detection via heartbeat monitoring
- Last-Event-ID persistence (memory, file, localStorage)
- Duplicate detection with bounded LRU cache
- Ordering enforcement with configurable rules
- Cannot-resume fallback handling (start_fresh, close, callback)
- Client-side metrics collection with pluggable sinks

#### Observability

- Server metrics: active_streams, streams_opened_total, disconnects_total, etc.
- Client metrics: reconnect_attempts_total, resume_success_total, event_lag_ms, etc.
- Structured logging with stream_id and trace_id correlation
- Debug logging for all components

#### Testing

- Comprehensive unit test suite (400+ tests)
- Fault injection test harness with scenario DSL
- Pre-built scenarios: drop-mid-stream, server-restart, liveness, dedupe, cannot-resume

#### CI/CD

- GitHub Actions CI pipeline with quality gates
- Lint, format, test, and harness gates
- PR template with checklist

### Changed

- N/A (initial release)

### Deprecated

- N/A (initial release)

### Removed

- N/A (initial release)

### Fixed

- N/A (initial release)

### Security

- Sensitive field redaction in logs
- Trace ID validation to prevent injection

---

## Version History

| Version | Date | Highlights      |
| ------- | ---- | --------------- |
| 1.0.0   | TBD  | Initial release |

---

## Upgrade Notes

### Upgrading to 1.0.0

This is the initial release. No upgrade steps required.

---

[Unreleased]: https://github.com/your-org/sse-streaming-reliability-kit/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/sse-streaming-reliability-kit/releases/tag/v1.0.0
