# CI Pipeline Documentation

This document describes the CI/CD pipeline for the SSE Streaming Reliability Kit.

## Overview

The CI pipeline runs on every push and pull request to `main` and `develop` branches. It consists of several quality gates that must pass before code can be merged.

## Quality Gates

### 1. Install Dependencies (SSRK-209)

- Uses npm ci for reproducible installs
- Caches `node_modules` based on `package-lock.json` hash
- Uploads artifacts for subsequent jobs

### 2. Lint Gate (SSRK-210)

- Runs ESLint on all JavaScript files
- Fails pipeline on any lint errors
- Configuration in `.eslintrc.json`

```bash
npm run lint        # Check for issues
npm run lint:fix    # Auto-fix issues
```

### 3. Format Check Gate (SSRK-211)

- Runs Prettier to check code formatting
- Fails pipeline on formatting drift
- Configuration in `.prettierrc`

```bash
npm run format:check  # Check formatting
npm run format        # Auto-format
```

### 4. Unit Test Gate (SSRK-212)

- Runs all unit tests via Vitest
- Fails pipeline on any test failure
- Uploads test results on failure for debugging

```bash
npm test              # Run tests
npm run test:coverage # Run with coverage
```

### 5. Harness Scenario Gate (SSRK-213)

- Runs fault injection scenarios
- Uses `--fail-fast` to stop on first failure
- 10-minute timeout for all scenarios

```bash
npm run harness run-all         # Run all scenarios
npm run harness run-all --fail-fast  # Stop on first failure
```

### 6. Build Gate (SSRK-214)

- Verifies project structure
- Checks all module imports work correctly
- Ensures no broken dependencies

## Artifact Upload (SSRK-215)

On failure, the following artifacts are uploaded for debugging:

| Artifact          | Contents              | Retention |
| ----------------- | --------------------- | --------- |
| `test-results`    | Test output, coverage | 7 days    |
| `harness-results` | Scenario output       | 7 days    |

## PR Requirements (SSRK-216)

Pull requests must:

1. Pass all CI checks
2. Have a descriptive title (10-100 characters)
3. Complete the PR checklist
4. Have at least one approval (if team)

## Local CI

Run the full CI pipeline locally:

```bash
npm run ci
```

This runs: lint → format:check → test → harness:all

## Workflow Files

| File                              | Purpose            |
| --------------------------------- | ------------------ |
| `.github/workflows/ci.yml`        | Main CI pipeline   |
| `.github/workflows/pr-checks.yml` | PR validation      |
| `.github/workflows/release.yml`   | Release automation |

## Exit Codes

| Code | Meaning                    |
| ---- | -------------------------- |
| 0    | All checks passed          |
| 1    | Test/scenario failures     |
| 2    | Configuration/setup errors |

## Troubleshooting

### Lint Failures

```bash
# View issues
npm run lint

# Auto-fix
npm run lint:fix
```

### Format Failures

```bash
# View diffs
npm run format:check

# Auto-format
npm run format
```

### Test Failures

```bash
# Run specific test file
npm test -- tests/client/state-machine.test.js

# Run with verbose output
npm test -- --reporter=verbose
```

### Harness Failures

```bash
# Run specific scenario
npm run harness run <scenario-name>

# Run with debug output
npm run harness run <scenario-name> -- --debug
```
