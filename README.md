# SSE Streaming Reliability Kit

Fix buffering and timeouts end-to-end for Server-Sent Events.

## Prerequisites

- Node.js >= 18.x
- npm >= 9.x

## Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm run dev

# 3. In another terminal, run the demo client
npm run client:demo
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the development server |
| `npm run client:demo` | Run the SSE client demo |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check code formatting |
| `npm run clean` | Remove build artifacts and reinstall |

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check - returns `{"status": "ok"}` |
| `GET /stream` | SSE stream endpoint |

## Configuration

Copy `.env.example` to `.env` and adjust values:
```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HOST` | localhost | Server host |
| `NODE_ENV` | development | Environment |
| `SSE_HEARTBEAT_INTERVAL` | 30000 | Heartbeat interval (ms) |
| `SSE_RETRY_TIMEOUT` | 3000 | Client retry timeout (ms) |

## Verify Installation
```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Test health endpoint
curl http://localhost:3000/health

# Terminal 2: Test SSE stream
npm run client:demo
```
