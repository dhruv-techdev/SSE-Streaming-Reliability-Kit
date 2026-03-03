/**
 * Reconnect Integration Tests (SSRK-104)
 * Tests auto-reconnect with real server
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { connectSSE, ConnectionState } from '../../client/src/sse-connector.js';

describe('Auto-Reconnect Integration', () => {
  let serverProcess;
  const port = 3096;

  const startServer = () => {
    return new Promise((resolve) => {
      serverProcess = spawn('node', ['server/src/server.js'], {
        env: { ...process.env, PORT: port, NODE_ENV: 'test' },
        stdio: 'pipe',
      });

      serverProcess.stdout.on('data', (data) => {
        if (data.toString().includes('SSE Streaming')) {
          resolve();
        }
      });

      setTimeout(resolve, 2000);
    });
  };

  const stopServer = () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      serverProcess = null;
    }
  };

  beforeAll(async () => {
    await startServer();
  });

  afterAll(() => {
    stopServer();
  });

  it('should connect successfully with retry policy configured', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      retryPolicy: {
        baseDelayMs: 500,
        maxAttempts: 3,
      },
      autoReconnect: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(connector.connected).toBe(true);
    expect(connector.getState()).toBe(ConnectionState.OPEN);

    connector.stop();
  });

  it('should fire onRetry callback when retry is scheduled', async () => {
    const retries = [];

    // Connect to non-existent server
    const connector = connectSSE(`http://localhost:${port + 999}/stream`, {
      retryPolicy: {
        baseDelayMs: 200,
        maxAttempts: 2,
        jitterPct: 0,
      },
      autoReconnect: true,
      onRetry: (info) => {
        retries.push(info);
      },
    });

    // Wait for retries to happen
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(retries.length).toBeGreaterThan(0);
    expect(retries[0]).toHaveProperty('attempt');
    expect(retries[0]).toHaveProperty('delayMs');
    expect(retries[0]).toHaveProperty('reason');

    connector.stop();
  });

  it('should reset retry count on successful connection', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      retryPolicy: {
        baseDelayMs: 500,
        maxAttempts: 5,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Should have reset after successful connection
    const stats = connector.getStats();
    expect(stats.retryAttempt).toBe(0);

    connector.stop();
  });

  it('should track reconnect statistics', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      retryPolicy: {
        baseDelayMs: 500,
        maxAttempts: 5,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const stats = connector.getStats();

    expect(stats).toHaveProperty('reconnect');
    expect(stats.reconnect).toHaveProperty('attempt');
    expect(stats.reconnect).toHaveProperty('policyConfig');

    connector.stop();
  });

  it('should provide retry policy configuration', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      retryPolicy: {
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        maxAttempts: 5,
        jitterPct: 0.2,
      },
    });

    const policy = connector.getRetryPolicy();
    const config = policy.getConfig();

    expect(config.baseDelayMs).toBe(1000);
    expect(config.maxDelayMs).toBe(10000);
    expect(config.maxAttempts).toBe(5);
    expect(config.jitterPct).toBe(0.2);

    connector.stop();
  });

  it('should not reconnect on manual stop()', async () => {
    const retries = [];

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      retryPolicy: {
        baseDelayMs: 100,
        maxAttempts: 5,
      },
      autoReconnect: true,
      onRetry: (info) => retries.push(info),
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(connector.connected).toBe(true);

    connector.stop();

    // Wait to ensure no retries happen
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(retries.length).toBe(0);
    expect(connector.getState()).toBe(ConnectionState.CLOSED);
  });

  it('should transition through correct states during reconnect', async () => {
    const states = [];

    // Connect to non-existent server first
    const connector = connectSSE(`http://localhost:${port + 888}/stream`, {
      retryPolicy: {
        baseDelayMs: 100,
        maxAttempts: 2,
        jitterPct: 0,
      },
      autoReconnect: true,
      onStateChange: ({ current }) => states.push(current),
    });

    // Wait for state transitions
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should see: connecting -> error -> retrying -> connecting -> error...
    expect(states).toContain(ConnectionState.CONNECTING);
    expect(states).toContain(ConnectionState.ERROR);
    expect(states).toContain(ConnectionState.RETRYING);

    connector.stop();
  });
});
