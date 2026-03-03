# Release Notes Template

Use this template when creating release notes for a new version.

---

# SSE Streaming Reliability Kit v{VERSION}

**Release Date:** {DATE}

## Highlights

{2-3 sentence summary of the most important changes in this release}

## What's New

### Features

- **{Feature Name}**: {Brief description} ([#PR](link))
- **{Feature Name}**: {Brief description} ([#PR](link))

### Improvements

- {Improvement description} ([#PR](link))
- {Improvement description} ([#PR](link))

### Bug Fixes

- Fixed {issue description} ([#PR](link))
- Fixed {issue description} ([#PR](link))

## Breaking Changes

{If MAJOR version bump, list all breaking changes with migration instructions}

### {Breaking Change Title}

**Before:**

```javascript
// Old API
```

**After:**

```javascript
// New API
```

**Migration Steps:**

1. Step one
2. Step two

## Deprecations

{List features deprecated in this release}

- `oldFunction()` is deprecated, use `newFunction()` instead
- `OldClass` is deprecated, use `NewClass` instead

## Compatibility

| Component | Minimum Version |
| --------- | --------------- |
| Node.js   | 18.0.0          |
| npm       | 9.0.0           |

## Installation

```bash
npm install sse-streaming-reliability-kit@{VERSION}
```

## Upgrade Instructions

### From v{PREVIOUS_VERSION}

1. Update package.json
2. Run `npm install`
3. {Any migration steps}

## Full Changelog

See [CHANGELOG.md](../CHANGELOG.md) for the complete list of changes.

## Contributors

Thanks to everyone who contributed to this release!

- @contributor1
- @contributor2

---

**Questions?** Open an issue on GitHub.
