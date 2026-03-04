# Versioning Policy

This document defines the versioning policy for the SSE Streaming Reliability Kit.

## Semantic Versioning (SemVer)

We follow [Semantic Versioning 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH
```

### Version Components

| Component | When to Increment                 | Example       |
| --------- | --------------------------------- | ------------- |
| **MAJOR** | Breaking changes to public API    | 1.0.0 → 2.0.0 |
| **MINOR** | New features, backward compatible | 1.0.0 → 1.1.0 |
| **PATCH** | Bug fixes, backward compatible    | 1.0.0 → 1.0.1 |

## What Constitutes a Breaking Change?

### Breaking (MAJOR bump required)

- Removing or renaming exported functions/classes
- Changing function signatures (required parameters)
- Changing return types
- Removing configuration options
- Changing event envelope schema in incompatible ways
- Changing SSE protocol behavior
- Removing or renaming event types

### Non-Breaking (MINOR bump)

- Adding new exported functions/classes
- Adding optional parameters with defaults
- Adding new configuration options
- Adding new event types
- Adding new control events
- Performance improvements
- New harness scenarios

### Bug Fixes (PATCH bump)

- Fixing incorrect behavior
- Fixing edge cases
- Fixing documentation errors
- Security patches
- Dependency updates (non-breaking)

## Pre-Release Versions

For pre-release versions, append a hyphen and identifier:

```
1.0.0-alpha.1
1.0.0-beta.1
1.0.0-rc.1
```

## Version Locations

Version is maintained in:

1. `package.json` - Source of truth
2. `CHANGELOG.md` - Release history
3. Git tags - `v1.0.0` format

## Upgrading

### Safe Upgrades

- **PATCH**: Always safe, upgrade freely
- **MINOR**: Safe, may add new features to learn

### Careful Upgrades

- **MAJOR**: Read upgrade notes in CHANGELOG.md
- Check "Breaking Changes" section
- Follow migration guide if provided

## Deprecation Policy

1. Features are deprecated in a MINOR release
2. Deprecated features emit console warnings
3. Deprecated features are removed in next MAJOR release
4. Minimum deprecation period: 2 minor releases

Example:

```
v1.2.0 - Feature X deprecated (warning added)
v1.3.0 - Feature X still works (still deprecated)
v2.0.0 - Feature X removed
```

## Release Cadence

- **PATCH**: As needed for bug fixes
- **MINOR**: Monthly or when features are ready
- **MAJOR**: Annually or when breaking changes accumulate

## Version Checking

Check the installed version:

```javascript
import { version } from 'sse-streaming-reliability-kit';
console.log(version); // "1.0.0"
```

Or via package.json:

```bash
npm list sse-streaming-reliability-kit
```
