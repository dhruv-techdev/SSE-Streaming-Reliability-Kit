# Examples

## Running Examples

### Basic Server + Client

```bash
# Terminal 1: Start basic server
node examples/basic-server.js

# Terminal 2: Start basic client
node examples/basic-client.js
```

### Full-Featured Demo

```bash
# Terminal 1: Start main server
npm run dev

# Terminal 2: Start resilient client
node examples/resilient-client.js
```

### Test Scenarios

```bash
# Kill server while client is connected
# Watch the client automatically reconnect!

# Check stats after running for a while
# Press Ctrl+C to see final statistics
```

## What Each Example Demonstrates

| Example               | Features                      |
| --------------------- | ----------------------------- |
| `basic-server.js`     | Simple SSE server with events |
| `basic-client.js`     | Minimal client with callbacks |
| `resilient-client.js` | All reliability features      |
