/**
 * Retry Limits Integration Tests (SSRK-112)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { connectSSE, ConnectionState, GiveUpReason } from '../../client/src/sse-connector.js';

describe('Retry Limits Integration', () => {
  let serverProcess;
  const port = 3095;

  beforeAll(async () => {
    serverProcess = spawn('node', ['server/src/server.js'], {
      env: { ...process.env, PORT: port, NODE_ENV: 'test' },
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

  it('should stop retrying at maxAttempts', async () => {
    let gaveUp = false;
    let giveUpInfo = null;

    // Connect to non-existent port
    const connector = connectSSE(`http://localhost:${port + 999}/stream`, {
      retryPolicy: {
        baseDelayMs: 50,
        maxAttempts: 2,
        jitterPct: 0,
      },
      autoReconnect: true,
      onGiveUp: (info) => {
        gaveUp = true;
        giveUpInfo = info;
      },
    });

    // Wait for retries to exhaust
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(gaveUp).toBe(true);
    expect(giveUpInfo.reason).toBe(GiveUpReason.MAX_ATTEMPTS);
    expect(giveUpInfo.attempts).toBe(2);
    expect(connector.hasGivenUp).toBe(true);
    expect(connector.getState()).toBe(ConnectionState.CLOSED);

    connector.stop();
  });

  it('should stop retrying at maxRetryTimeMs', async () => {
    let gaveUp = false;
    let giveUpInfo = null;

    const connector = connectSSE(`http://localhost:${port + 888}/stream`, {
      retryPolicy: {
        baseDelayMs: 50,
        maxAttempts: 100, // High limit
        maxRetryTimeMs: 200, // But time cap at 200ms
        jitterPct: 0,
      },
      autoReconnect: true,
      onGiveUp: (info) => {
        gaveUp = true;
        giveUpInfo = info;
      },
    });

    // Wait for time limit
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(gaveUp).toBe(true);
    expect(giveUpInfo.reason).toBe(GiveUpReason.MAX_TIME);
    expect(connector.hasGivenUp).toBe(true);

    connector.stop();
  });

  it('should not retry after manual stop()', async () => {
    let retryCount = 0;

    const connector = connectSSE(`http://localhost:${port}/stream`, {
      retryPolicy: {
        baseDelayMs: 100,
        maxAttempts: 10,
      },
      autoReconnect: true,
      onRetry: () => {
        retryCount++;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(connector.connected).toBe(true);

    connector.stop();

    // Wait and verify no retries
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(retryCount).toBe(0);
    expect(connector.getState()).toBe(ConnectionState.CLOSED);
  });

  it('should allow restart after give-up (SSRK-111)', async () => {
    let gaveUp = false;

    const connector = connectSSE(`http://localhost:${port + 777}/stream`, {
      retryPolicy: {
        baseDelayMs: 50,
        maxAttempts: 1,
        jitterPct: 0,
      },
      autoReconnect: true,
      onGiveUp: () => {
        gaveUp = true;
      },
    });

    // Wait for give up
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(gaveUp).toBe(true);
    expect(connector.hasGivenUp).toBe(true);

    // Now restart with valid server
    connector.url = new URL(`http://localhost:${port}/stream`);
    connector.restart();

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(connector.hasGivenUp).toBe(false);
    expect(connector.connected).toBe(true);

    connector.stop();
  });

  it('should reset retry count on successful connection', async () => {
    const connector = connectSSE(`http://localhost:${port}/stream`, {
      retryPolicy: {
        baseDelayMs: 100,
        maxAttempts: 5,
      },
      autoReconnect: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const stats = connector.getStats();
    expect(stats.retryAttempt).toBe(0); // Reset after success
    expect(stats.reconnect.hasGivenUp).toBe(false);

    connector.stop();
  });

  it('should include elapsedMs in onGiveUp', async () => {
    let elapsedMs = 0;

    const connector = connectSSE(`http://localhost:${port + 666}/stream`, {
      retryPolicy: {
        baseDelayMs: 100,
        maxAttempts: 2,
        jitterPct: 0,
      },
      autoReconnect: true,
      onGiveUp: (info) => {
        elapsedMs = info.elapsedMs;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should have some elapsed time
    expect(elapsedMs).toBeGreaterThan(0);

    connector.stop();
  });
});
