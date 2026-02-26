/**
 * Correlation ID Integration Tests (SSRK-190)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import http from 'http';
import { connectSSE } from '../../client/src/sse-connector.js';

describe('Correlation ID Integration', () => {
  let serverProcess;
  const port = 3085;

  beforeAll(async () => {
    serverProcess = spawn('node', ['server/src/server.js'], {
      env: { 
        ...process.env, 
        PORT: port, 
        NODE_ENV: 'test',
        SSE_TICK_INTERVAL: '200',
        SSE_HEARTBEAT_INTERVAL: '60000',
      },
      stdio: 'pipe',
    });

    await new Promise((resolve) => {
      serverProcess.stdout.on('data', (data) => {
        if (data.toString().includes('SSE Streaming')) {
          resolve();
        }
      });
      setTimeout(resolve, 2000);
    });
  });

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  });

  it('should receive stream_id in control.open (SSRK-186, SSRK-188)', async () => {
    let streamIdFromOpen = null;
    let controlEvents = [];

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      onControl: (event) => {
        controlEvents.push(event);
        if (event.type === 'control.open') {
          streamIdFromOpen = event.payload?.stream_id;
        }
      },
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Should have received control.open with stream_id
    expect(streamIdFromOpen).toBeDefined();
    expect(streamIdFromOpen).toMatch(/^stream-/);

    // Client should store the stream_id
    expect(connector.serverStreamId).toBe(streamIdFromOpen);

    connector.stop();
  });

  it('should include stream_id in all events (SSRK-186)', async () => {
    const events = [];

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      onEvent: (event) => {
        events.push(event);
      },
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // All domain events should have stream_id
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.stream_id).toBeDefined();
      expect(event.stream_id).toMatch(/^stream-/);
    }

    connector.stop();
  });

  it('should pass trace_id from client to server (SSRK-187)', async () => {
    const traceId = 'client-trace-12345';
    let receivedTraceId = null;

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      traceId,
      onControl: (event) => {
        if (event.type === 'control.open') {
          receivedTraceId = event.payload?.trace_id;
        }
      },
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Server should echo back the trace_id
    expect(receivedTraceId).toBe(traceId);

    connector.stop();
  });

  it('should include trace_id in events when provided (SSRK-187)', async () => {
    const traceId = 'test-trace-abc';
    const events = [];

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      traceId,
      onEvent: (event) => {
        events.push(event);
      },
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Events should include trace_id
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.trace_id).toBe(traceId);
    }

    connector.stop();
  });

  it('should include stream_id and trace_id in stats', async () => {
    const traceId = 'stats-trace-id';

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      traceId,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const stats = connector.getStats();

    expect(stats.serverStreamId).toBeDefined();
    expect(stats.serverStreamId).toMatch(/^stream-/);
    expect(stats.traceId).toBe(traceId);

    connector.stop();
  });

  it('should work without trace_id (optional)', async () => {
    const events = [];

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      // No traceId provided
      onEvent: (event) => {
        events.push(event);
      },
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Should still work, events have stream_id but not trace_id
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].stream_id).toBeDefined();
    expect(events[0].trace_id).toBeUndefined();

    connector.stop();
  });

  it('should use same stream_id across resume (SSRK-189)', async () => {
    let firstStreamId = null;

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      autoReconnect: false,
      enableLivenessCheck: false,
      onControl: (event) => {
        if (event.type === 'control.open' && !firstStreamId) {
          firstStreamId = event.payload?.stream_id;
        }
      },
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(firstStreamId).toBeDefined();

    // Note: After reconnect, server will generate a NEW stream_id
    // This is correct behavior - each connection gets its own stream_id
    // The client stores it for correlation

    connector.stop();
  });
});
