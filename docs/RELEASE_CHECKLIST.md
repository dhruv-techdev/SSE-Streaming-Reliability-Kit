# SSE Streaming Reliability Kit - Release Checklist v1.0.0

This checklist proves completeness for the v1.0.0 release. Every item must be verified before GA.

---

## Release Information

| Field           | Value      |
| --------------- | ---------- |
| Version         | 1.0.0      |
| Release Date    | **\_\_\_** |
| Release Manager | **\_\_\_** |
| Sign-off Date   | **\_\_\_** |

---

## 1. Requirements Traceability

### 1.1 SRS Requirements → Test Coverage (SSRK-239)

All P0 requirements must have corresponding test coverage.

| Req ID                           | Requirement                         | Test File                                  | Status |
| -------------------------------- | ----------------------------------- | ------------------------------------------ | ------ |
| **US-01: Project Scaffolding**   |
| SSRK-001                         | Package.json with ES modules        | `tests/ci/ci-sanity.test.js`               | ☐      |
| SSRK-002                         | Vitest configuration                | `vitest.config.js`                         | ☐      |
| **US-02: Event Envelope Schema** |
| SSRK-011                         | Event envelope with required fields | `tests/shared/schema.test.js`              | ☐      |
| SSRK-012                         | UUIDv7 event ID generation          | `tests/shared/event-id.test.js`            | ☐      |
| SSRK-013                         | Reserved event types                | `tests/shared/types.test.js`               | ☐      |
| **US-03: SSE Server**            |
| SSRK-021                         | Fastify SSE endpoint                | `tests/server/server.test.js`              | ☐      |
| SSRK-022                         | Connection registry                 | `tests/server/connection-registry.test.js` | ☐      |
| SSRK-023                         | Heartbeat scheduler                 | `tests/server/heartbeat.test.js`           | ☐      |
| **US-04: SSE Client**            |
| SSRK-031                         | HTTP client connection              | `tests/client/sse-connector.test.js`       | ☐      |
| SSRK-032                         | Event parsing                       | `tests/shared/envelope.test.js`            | ☐      |
| SSRK-033                         | Callback invocation                 | `tests/client/sse-connector.test.js`       | ☐      |
| **US-05: Retry Policy**          |
| SSRK-041                         | Exponential backoff                 | `tests/client/retry-policy.test.js`        | ☐      |
| SSRK-042                         | Jitter implementation               | `tests/client/retry-policy.test.js`        | ☐      |
| SSRK-043                         | Max delay cap                       | `tests/client/retry-policy.test.js`        | ☐      |
| **US-06: State Machine**         |
| SSRK-051                         | Connection states                   | `tests/client/state-machine.test.js`       | ☐      |
| SSRK-052                         | State transitions                   | `tests/client/state-machine.test.js`       | ☐      |
| SSRK-053                         | Invalid transition handling         | `tests/client/state-machine.test.js`       | ☐      |
| **US-07: Reconnection**          |
| SSRK-061                         | Auto-reconnect                      | `tests/client/reconnect-manager.test.js`   | ☐      |
| SSRK-062                         | Reconnect manager                   | `tests/client/reconnect-manager.test.js`   | ☐      |
| **US-08: Circuit Breaker**       |
| SSRK-071                         | Max attempts                        | `tests/client/reconnect-manager.test.js`   | ☐      |
| SSRK-072                         | Max retry time                      | `tests/client/reconnect-manager.test.js`   | ☐      |
| SSRK-073                         | Give-up behavior                    | `tests/client/reconnect-manager.test.js`   | ☐      |
| **US-09: Heartbeat/Keepalive**   |
| SSRK-081                         | Heartbeat generation                | `tests/server/heartbeat.test.js`           | ☐      |
| SSRK-082                         | Heartbeat envelope                  | `tests/shared/envelope.test.js`            | ☐      |
| **US-10: Liveness Detection**    |
| SSRK-091                         | Liveness monitor                    | `tests/client/liveness-monitor.test.js`    | ☐      |
| SSRK-092                         | Timeout detection                   | `tests/client/liveness-monitor.test.js`    | ☐      |
| SSRK-093                         | Grace period                        | `tests/client/liveness-monitor.test.js`    | ☐      |
| **US-11: Last-Event-ID**         |
| SSRK-101                         | Event ID tracking                   | `tests/client/event-id-store.test.js`      | ☐      |
| SSRK-102                         | Storage adapters                    | `tests/client/event-id-store.test.js`      | ☐      |
| SSRK-103                         | Header sending                      | `tests/integration/resume.test.js`         | ☐      |
| **US-12: Server Replay Buffer**  |
| SSRK-111                         | Replay buffer                       | `tests/server/replay-buffer.test.js`       | ☐      |
| SSRK-112                         | Event retrieval                     | `tests/server/replay-buffer.test.js`       | ☐      |
| SSRK-113                         | Bounded size                        | `tests/server/replay-buffer.test.js`       | ☐      |
| **US-13: Bounded Replay**        |
| SSRK-121                         | Max replay batch                    | `tests/server/replay-buffer.test.js`       | ☐      |
| SSRK-122                         | Truncation signal                   | `tests/server/replay-buffer.test.js`       | ☐      |
| **US-14: Cannot-Resume**         |
| SSRK-131                         | Cannot-resume signal                | `tests/server/replay-buffer.test.js`       | ☐      |
| SSRK-132                         | Reason codes                        | `tests/shared/constants.test.js`           | ☐      |
| **US-15: Fallback Handling**     |
| SSRK-141                         | Start fresh fallback                | `tests/client/sse-connector.test.js`       | ☐      |
| SSRK-142                         | Close fallback                      | `tests/client/sse-connector.test.js`       | ☐      |
| SSRK-143                         | Callback fallback                   | `tests/client/sse-connector.test.js`       | ☐      |
| **US-16: Dedupe**                |
| SSRK-146                         | Dedupe cache                        | `tests/client/dedupe-cache.test.js`        | ☐      |
| SSRK-147                         | LRU eviction                        | `tests/client/dedupe-cache.test.js`        | ☐      |
| SSRK-148                         | Duplicate callback                  | `tests/client/dedupe-cache.test.js`        | ☐      |
| **US-17: Ordering**              |
| SSRK-152                         | Ordering guard                      | `tests/client/ordering-guard.test.js`      | ☐      |
| SSRK-153                         | Ordering rules                      | `tests/client/ordering-guard.test.js`      | ☐      |
| SSRK-154                         | Out-of-order policy                 | `tests/client/ordering-guard.test.js`      | ☐      |
| **US-18: Server Metrics**        |
| SSRK-158                         | Metrics registry                    | `tests/server/metrics.test.js`             | ☐      |
| SSRK-159                         | Prometheus format                   | `tests/server/metrics.test.js`             | ☐      |
| **US-19: Client Metrics**        |
| SSRK-166                         | Client metrics                      | `tests/client/client-metrics.test.js`      | ☐      |
| SSRK-167                         | Metrics sink                        | `tests/client/client-metrics.test.js`      | ☐      |
| SSRK-168                         | Lag tracking                        | `tests/client/client-metrics.test.js`      | ☐      |
| **US-20: Structured Logging**    |
| SSRK-174                         | Log schema                          | `tests/shared/logger.test.js`              | ☐      |
| SSRK-175                         | Server logger                       | `tests/shared/logger.test.js`              | ☐      |
| SSRK-176                         | Client logger                       | `tests/shared/logger.test.js`              | ☐      |
| **US-21: Correlation IDs**       |
| SSRK-183                         | stream_id/trace_id                  | `tests/shared/correlation.test.js`         | ☐      |
| SSRK-184                         | Stream ID generation                | `tests/shared/correlation.test.js`         | ☐      |
| SSRK-187                         | Trace ID extraction                 | `tests/shared/correlation.test.js`         | ☐      |
| **US-22: Fault Injection**       |
| SSRK-191                         | Harness CLI                         | `tests/harness/scenario.test.js`           | ☐      |
| SSRK-192                         | Scenario format                     | `tests/harness/scenario.test.js`           | ☐      |
| SSRK-193                         | Drop mid-stream                     | `harness/scenarios/drop-mid-stream.js`     | ☐      |
| **US-23: Assertions**            |
| SSRK-200                         | Assertion API                       | `tests/harness/assertions.test.js`         | ☐      |
| SSRK-206                         | Reporter                            | `tests/harness/reporter.test.js`           | ☐      |

### 1.2 SRS Requirements → Documentation (SSRK-240)

Key requirements must be documented.

| Req ID   | Requirement        | Documentation                                 | Status |
| -------- | ------------------ | --------------------------------------------- | ------ |
| SSRK-011 | Event envelope     | `README.md#api-surface`                       | ☐      |
| SSRK-041 | Retry policy       | `docs/configuration.md#retry-policy`          | ☐      |
| SSRK-091 | Liveness detection | `docs/configuration.md#liveness-options`      | ☐      |
| SSRK-101 | Last-Event-ID      | `docs/configuration.md#resume-options`        | ☐      |
| SSRK-146 | Deduplication      | `docs/configuration.md#deduplication-options` | ☐      |
| SSRK-158 | Server metrics     | `docs/metrics.md`                             | ☐      |
| SSRK-166 | Client metrics     | `docs/metrics.md`                             | ☐      |
| SSRK-174 | Logging            | `docs/logging.md`                             | ☐      |
| SSRK-183 | Correlation IDs    | `docs/logging.md`                             | ☐      |
| All      | Operations         | `docs/RUNBOOK.md`                             | ☐      |

---

## 2. Functional Verification

### 2.1 Unit Tests

```bash
npm test
```

| Check            | Command                 | Expected   | Status |
| ---------------- | ----------------------- | ---------- | ------ |
| All tests pass   | `npm test`              | 0 failures | ☐      |
| No skipped tests | Check output            | 0 skipped  | ☐      |
| Coverage > 80%   | `npm run test:coverage` | > 80%      | ☐      |

### 2.2 Integration Tests

| Check                   | Command                                             | Expected | Status |
| ----------------------- | --------------------------------------------------- | -------- | ------ |
| Resume integration      | `npm test -- tests/integration/resume.test.js`      | Pass     | ☐      |
| Correlation integration | `npm test -- tests/integration/correlation.test.js` | Pass     | ☐      |

### 2.3 Harness Scenarios

```bash
npm run harness run-all
```

| Scenario                  | Tag             | Status |
| ------------------------- | --------------- | ------ |
| drop-mid-stream           | reconnect       | ☐      |
| server-idle-timeout       | liveness        | ☐      |
| server-restart            | reconnect       | ☐      |
| delayed-bursty-events     | stability       | ☐      |
| duplicate-injection       | dedupe          | ☐      |
| cannot-resume             | resume          | ☐      |
| assert-reconnect-behavior | circuit-breaker | ☐      |
| assert-resume-behavior    | resume          | ☐      |
| assert-dedupe-behavior    | dedupe          | ☐      |
| assert-liveness-recovery  | liveness        | ☐      |

---

## 3. Fresh Clone Verification (SSRK-241)

Verify the quickstart works on a clean environment.

### 3.1 Prerequisites Check

| Check                               | Status |
| ----------------------------------- | ------ |
| Node.js 18+ installed               | ☐      |
| npm 9+ installed                    | ☐      |
| Git installed                       | ☐      |
| Clean directory (no existing clone) | ☐      |

### 3.2 Clone & Install

```bash
git clone https://github.com/your-org/sse-streaming-reliability-kit.git
cd sse-streaming-reliability-kit
npm install
```

| Check                       | Expected                        | Status |
| --------------------------- | ------------------------------- | ------ |
| Clone succeeds              | No errors                       | ☐      |
| npm install succeeds        | No errors                       | ☐      |
| No security vulnerabilities | `npm audit` clean or acceptable | ☐      |

### 3.3 Run Tests

```bash
npm test
```

| Check      | Expected   | Status |
| ---------- | ---------- | ------ |
| Tests pass | 0 failures | ☐      |

### 3.4 Start Server

```bash
npm run dev
```

| Check                  | Expected                                          | Status |
| ---------------------- | ------------------------------------------------- | ------ |
| Server starts          | Banner displayed                                  | ☐      |
| Health endpoint works  | `curl http://localhost:3000/health` returns OK    | ☐      |
| Metrics endpoint works | `curl http://localhost:3000/metrics` returns data | ☐      |

### 3.5 Run Client Demo

```bash
npm run client:demo
```

| Check              | Expected                                | Status |
| ------------------ | --------------------------------------- | ------ |
| Client connects    | "Connected" message                     | ☐      |
| Events received    | Events logged                           | ☐      |
| Reconnection works | Kill server, restart, client reconnects | ☐      |

### 3.6 Run Examples

```bash
node examples/basic-server.js &
node examples/basic-client.js
```

| Check                 | Expected      | Status |
| --------------------- | ------------- | ------ |
| Basic server starts   | Port 3001     | ☐      |
| Basic client connects | Events logged | ☐      |

---

## 4. CI Pipeline Verification

### 4.1 Local CI

```bash
npm run ci
```

| Check               | Expected           | Status |
| ------------------- | ------------------ | ------ |
| Lint passes         | No errors          | ☐      |
| Format check passes | No diffs           | ☐      |
| Tests pass          | 0 failures         | ☐      |
| Harness passes      | All scenarios pass | ☐      |

### 4.2 GitHub Actions (if applicable)

| Check                    | Status |
| ------------------------ | ------ |
| CI workflow exists       | ☐      |
| CI passes on main branch | ☐      |
| Release workflow exists  | ☐      |

---

## 5. Documentation Verification

### 5.1 Required Documents

| Document                | Exists | Reviewed | Status |
| ----------------------- | ------ | -------- | ------ |
| README.md               | ☐      | ☐        | ☐      |
| CHANGELOG.md            | ☐      | ☐        | ☐      |
| LICENSE                 | ☐      | ☐        | ☐      |
| CONTRIBUTING.md         | ☐      | ☐        | ☐      |
| docs/getting-started.md | ☐      | ☐        | ☐      |
| docs/configuration.md   | ☐      | ☐        | ☐      |
| docs/metrics.md         | ☐      | ☐        | ☐      |
| docs/logging.md         | ☐      | ☐        | ☐      |
| docs/RUNBOOK.md         | ☐      | ☐        | ☐      |
| docs/versioning.md      | ☐      | ☐        | ☐      |

### 5.2 README Sections

| Section                 | Present | Status |
| ----------------------- | ------- | ------ |
| Features                | ☐       | ☐      |
| Quick Start             | ☐       | ☐      |
| Installation            | ☐       | ☐      |
| Integration Guide       | ☐       | ☐      |
| Configuration Reference | ☐       | ☐      |
| Examples                | ☐       | ☐      |
| API Surface             | ☐       | ☐      |
| Compatibility Notes     | ☐       | ☐      |

---

## 6. Version & Changelog (SSRK-242)

### 6.1 Version Consistency

```bash
grep '"version"' package.json
head -20 CHANGELOG.md
```

| Check                       | Expected | Status |
| --------------------------- | -------- | ------ |
| package.json version        | 1.0.0    | ☐      |
| CHANGELOG has 1.0.0 section | Yes      | ☐      |
| CHANGELOG date filled       | Yes      | ☐      |

### 6.2 CHANGELOG Completeness

| Section    | Has Content   | Status |
| ---------- | ------------- | ------ |
| Added      | ☐             | ☐      |
| Changed    | N/A (initial) | ☐      |
| Deprecated | N/A (initial) | ☐      |
| Removed    | N/A (initial) | ☐      |
| Fixed      | N/A (initial) | ☐      |
| Security   | N/A (initial) | ☐      |

---

## 7. Release Artifacts (SSRK-243)

### 7.1 Build

```bash
npm run build
```

| Check                | Expected         | Status |
| -------------------- | ---------------- | ------ |
| Build succeeds       | No errors        | ☐      |
| dist/ created        | Directory exists | ☐      |
| dist/index.js exists | File exists      | ☐      |
| dist/client/ exists  | Directory exists | ☐      |
| dist/server/ exists  | Directory exists | ☐      |
| dist/shared/ exists  | Directory exists | ☐      |

### 7.2 Package Contents

```bash
npm pack --dry-run
```

| Check                | Expected                          | Status |
| -------------------- | --------------------------------- | ------ |
| Package name correct | sse-streaming-reliability-kit     | ☐      |
| Version correct      | 1.0.0                             | ☐      |
| Files included       | dist/, README, CHANGELOG, LICENSE | ☐      |
| No extra files       | No node_modules, tests, etc.      | ☐      |

### 7.3 Git Tag

| Check                  | Command                  | Status |
| ---------------------- | ------------------------ | ------ |
| Tag created            | `git tag v1.0.0`         | ☐      |
| Tag pushed             | `git push origin v1.0.0` | ☐      |
| GitHub release created | Manual or workflow       | ☐      |

---

## 8. Final Sign-Off

### 8.1 Checklist Summary

| Category             | Items      | Completed | Status |
| -------------------- | ---------- | --------- | ------ |
| Requirements → Tests | 50+        | \_\_\_/50 | ☐      |
| Requirements → Docs  | 10         | \_\_\_/10 | ☐      |
| Unit Tests           | All pass   | Yes/No    | ☐      |
| Integration Tests    | All pass   | Yes/No    | ☐      |
| Harness Scenarios    | 10 pass    | \_\_\_/10 | ☐      |
| Fresh Clone          | All steps  | Yes/No    | ☐      |
| CI Pipeline          | Passes     | Yes/No    | ☐      |
| Documentation        | 10 docs    | \_\_\_/10 | ☐      |
| Version/Changelog    | Consistent | Yes/No    | ☐      |
| Build                | Succeeds   | Yes/No    | ☐      |

### 8.2 Known Issues

List any known issues shipping with this release:

| Issue  | Severity | Workaround | Tracking |
| ------ | -------- | ---------- | -------- |
| (none) |          |            |          |

### 8.3 Sign-Off

| Role            | Name       | Date       | Signature  |
| --------------- | ---------- | ---------- | ---------- |
| Developer       | **\_\_\_** | **\_\_\_** | **\_\_\_** |
| Reviewer        | **\_\_\_** | **\_\_\_** | **\_\_\_** |
| Release Manager | **\_\_\_** | **\_\_\_** | **\_\_\_** |

---

## Release Commands

Once all checks pass:

```bash
# 1. Ensure clean state
git status  # Should be clean

# 2. Update version
npm version 1.0.0 --no-git-tag-version

# 3. Update CHANGELOG date
# Edit CHANGELOG.md, replace TBD with today's date

# 4. Build
npm run build

# 5. Commit
git add -A
git commit -m "chore: release v1.0.0"

# 6. Tag
git tag -a v1.0.0 -m "Release v1.0.0"

# 7. Push
git push origin main
git push origin v1.0.0

# 8. Publish (if npm)
npm publish

# 9. Create GitHub Release
# Go to GitHub → Releases → Create from tag v1.0.0
```

---

**Checklist Version:** 1.0.0  
**Last Updated:** \***\*\_\_\_\*\***
