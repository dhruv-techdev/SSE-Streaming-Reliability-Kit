# Contributing to SSE Streaming Reliability Kit

Thank you for your interest in contributing!

## Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/sse-streaming-reliability-kit.git
cd sse-streaming-reliability-kit

# Install dependencies
npm install

# Run tests
npm test

# Start dev server
npm run dev
```

## Making Changes

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Run checks: `npm run ci`
4. Commit with conventional commits: `git commit -m "feat: add feature"`
5. Push and create PR

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Adding/updating tests
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

## Testing

- Write tests for new features
- Ensure all tests pass: `npm test`
- Run harness scenarios: `npm run harness:all`

## Code Style

- Run lint: `npm run lint`
- Run format: `npm run format`
- Follow existing patterns

## Questions?

Open an issue for discussion.
