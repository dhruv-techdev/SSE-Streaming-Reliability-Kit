# Contributing to SSE Streaming Reliability Kit

## Branch Naming Convention

```
<type>/<ticket-id>-<short-description>
```

### Types

- `feature/` - New features
- `bugfix/` - Bug fixes
- `hotfix/` - Urgent fixes
- `docs/` - Documentation
- `refactor/` - Refactoring
- `test/` - Tests
- `chore/` - Maintenance

### Examples

```
feature/SSRK-10-project-scaffolding
bugfix/SSRK-25-fix-sse-timeout
```

---

## Commit Message Convention

Follow Conventional Commits:

```
<type>(<scope>): <subject>
```

### Types

| Type       | Description   |
| ---------- | ------------- |
| `feat`     | New feature   |
| `fix`      | Bug fix       |
| `docs`     | Documentation |
| `style`    | Formatting    |
| `refactor` | Refactoring   |
| `test`     | Tests         |
| `chore`    | Maintenance   |

### Examples

```
feat(server): add SSE heartbeat mechanism
fix(client): handle reconnection on timeout
docs: update README with setup instructions
```

---

## PR Checklist

- [ ] Branch follows naming convention
- [ ] Commits follow conventional commits
- [ ] Code passes `npm run lint`
- [ ] Code passes `npm run format:check`
- [ ] Tests added/updated (if applicable)
- [ ] Documentation updated (if applicable)
