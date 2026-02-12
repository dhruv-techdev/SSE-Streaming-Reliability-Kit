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

# 3. In another terminal, verify streaming works
npm run client:demo
```

## Verification Steps (ST-07)

### Option 1: Using the demo client
```bash
# Terminal 1
npm run dev

# Terminal 2
npm run client:demo
```

Expected output:
- `✓ Content-Type: text/event-stream`
- `✓ control.open received`
- Multiple `✓ domain.stream.tick` events
- `RESULT: PASS ✓`

### Option 2: Using curl
```bash
# Terminal 1
npm run dev

# Terminal 2
curl -N -H "Accept: text/event-stream" http://localhost:3000/stream
```

Expected output:
```
id: <uuid>
event: control.open
data: {"event_id":"...","type":"control.open",...}

id: <uuid>
event: domain.stream.tick
data: {"event_id":"...","type":"domain.stream.tick","payload":{"sequence":1,...}}
```

### Option 3: Health check
```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"...","connections":0,"bufferedEvents":0}

curl http://localhost:3000/info
# Returns server configuration and stats
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the development server |
| `npm run client:demo` | Run SSE verification client |
| `npm test` | Run all tests |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run clean` | Remove artifacts and reinstall |

## Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HOST` | localhost | Server host |
| `SSE_TICK_INTERVAL` | 2000 | Tick event interval (ms) |
| `SSE_HEARTBEAT_INTERVAL` | 30000 | Heartbeat interval (ms) |
| `SSE_RETRY_TIMEOUT` | 3000 | Client retry suggestion (ms) |
| `SSE_MAX_BUFFER_SIZE` | 1000 | Max events for replay |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check with connection count |
| `GET /info` | Server config and stats |
| `GET /stream` | SSE stream endpoint |

## Event Types

| Type | Description |
|------|-------------|
| `control.open` | Connection established |
| `control.close` | Connection closing |
| `control.reconnect` | Resume instructions |
| `system.heartbeat` | Keep-alive signal |
| `system.error` | Error notification |
| `domain.stream.tick` | Periodic tick event |

## Protocol Documentation

See [docs/SSE_PROTOCOL.md](docs/SSE_PROTOCOL.md) for full protocol specification.
